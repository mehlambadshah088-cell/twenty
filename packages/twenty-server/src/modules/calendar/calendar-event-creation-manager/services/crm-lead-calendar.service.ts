import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';

import { google } from 'googleapis';
import {
  ConnectedAccountProvider,
  type ObjectRecord,
} from 'twenty-shared/types';
import { IsNull, type DataSource, type Repository } from 'typeorm';
import { isDefined } from 'twenty-shared/utils';

import { UserWorkspaceService } from 'src/engine/core-modules/user-workspace/user-workspace.service';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { type WorkspaceMemberWorkspaceEntity } from 'src/modules/workspace-member/standard-objects/workspace-member.workspace-entity';
import { CalendarEventComposerService } from 'src/modules/calendar/calendar-event-creation-manager/services/calendar-event-composer.service';
import { CreateCalendarEventService } from 'src/modules/calendar/calendar-event-creation-manager/services/create-calendar-event.service';
import {
  BookCrmLeadMeetingInput,
  BookCrmLeadMeetingOutput,
  CrmLeadCalendarAvailabilityInput,
  CrmLeadCalendarAvailability,
  CrmLeadCalendarBusyInterval,
  CrmLeadCalendarOwner,
} from 'src/modules/calendar/calendar-event-creation-manager/dtos/crm-lead-calendar.input';
import { GoogleOAuth2ClientProvider } from 'src/modules/connected-account/oauth2-client-manager/drivers/google/google-oauth2-client.provider';
import { isValidTimeZone } from 'src/modules/calendar/calendar-event-creation-manager/utils/is-valid-time-zone.util';
import { resolveCalendarEventTimeZone } from 'src/modules/calendar/calendar-event-creation-manager/utils/resolve-calendar-event-time-zone.util';

const GOOGLE_PRIMARY_CALENDAR_ID = 'primary';
const GOOGLE_CALENDAR_EVENTS_SCOPE =
  'https://www.googleapis.com/auth/calendar.events';
const GOOGLE_CALENDAR_FREEBUSY_SCOPES = [
  'https://www.googleapis.com/auth/calendar.freebusy',
  'https://www.googleapis.com/auth/calendar.events.freebusy',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar',
];
const MAX_CALENDAR_QUERY_WINDOW_MS = 31 * 24 * 60 * 60 * 1000;
const OFFSET_DATE_TIME_PATTERN = /(?:Z|[+-]\d{2}:\d{2})$/i;

type OwnerCalendarContext = {
  ownerWorkspaceMember: WorkspaceMemberWorkspaceEntity;
  connectedAccount: ConnectedAccountEntity;
};

@Injectable()
export class CrmLeadCalendarService {
  private readonly logger = new Logger(CrmLeadCalendarService.name);

  constructor(
    @InjectRepository(ConnectedAccountEntity)
    private readonly connectedAccountRepository: Repository<ConnectedAccountEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly userWorkspaceService: UserWorkspaceService,
    private readonly workspaceOrmManager: WorkspaceOrmManager,
    private readonly googleOAuth2ClientProvider: GoogleOAuth2ClientProvider,
    private readonly calendarEventComposerService: CalendarEventComposerService,
    private readonly createCalendarEventService: CreateCalendarEventService,
  ) {}

  async getAvailableOwners(
    workspaceId: string,
  ): Promise<CrmLeadCalendarOwner[]> {
    const connectedAccounts = await this.connectedAccountRepository.find({
      where: {
        workspaceId,
        provider: ConnectedAccountProvider.GOOGLE,
        scope: 'USER',
        archivedAt: IsNull(),
      },
      relations: { calendarChannels: true },
      order: { updatedAt: 'DESC' },
    });

    const availableUserWorkspaceIds = new Set(
      connectedAccounts
        .filter(
          (connectedAccount) =>
            connectedAccount.scopes?.includes(GOOGLE_CALENDAR_EVENTS_SCOPE) &&
            connectedAccount.scopes?.some((scope) =>
              GOOGLE_CALENDAR_FREEBUSY_SCOPES.includes(scope),
            ) &&
            connectedAccount.calendarChannels?.some(
              (calendarChannel) => calendarChannel.isSyncEnabled,
            ),
        )
        .map((connectedAccount) => connectedAccount.userWorkspaceId),
    );

    if (availableUserWorkspaceIds.size === 0) {
      return [];
    }

    const userWorkspaces = await Promise.all(
      [...availableUserWorkspaceIds].map((userWorkspaceId) =>
        this.userWorkspaceService.findById(userWorkspaceId),
      ),
    );
    const availableUserIds = new Set(
      userWorkspaces
        .filter(
          (userWorkspace) =>
            isDefined(userWorkspace) &&
            userWorkspace.workspaceId === workspaceId,
        )
        .map((userWorkspace) => userWorkspace.userId),
    );

    if (availableUserIds.size === 0) {
      return [];
    }

    const workspaceMembers =
      await this.workspaceOrmManager.executeInWorkspaceContext(async () => {
        const workspaceMemberRepository =
          this.workspaceOrmManager.getRepositoryWithoutPermissionChecks<WorkspaceMemberWorkspaceEntity>(
            'workspaceMember',
          );

        return workspaceMemberRepository.find();
      }, buildSystemAuthContext(workspaceId));

    return workspaceMembers
      .filter(
        (workspaceMember) =>
          availableUserIds.has(workspaceMember.userId) &&
          isDefined(workspaceMember.userEmail),
      )
      .map((workspaceMember) => ({
        id: workspaceMember.id,
        name:
          [workspaceMember.name?.firstName, workspaceMember.name?.lastName]
            .filter(Boolean)
            .join(' ') ||
          workspaceMember.userEmail ||
          'Workspace member',
        email: workspaceMember.userEmail as string,
        timeZone: workspaceMember.timeZone ?? null,
      }))
      .sort((first, second) => first.name.localeCompare(second.name));
  }

  async getAvailability(
    input: CrmLeadCalendarAvailabilityInput,
    workspaceId: string,
  ): Promise<CrmLeadCalendarAvailability> {
    this.validateTimeWindow(input.startsAt, input.endsAt);

    const { ownerWorkspaceMember, connectedAccount } =
      await this.resolveOwnerCalendar(
        input.ownerWorkspaceMemberId,
        workspaceId,
      );
    const timeZone = this.resolveTimeZone(
      input.timeZone,
      ownerWorkspaceMember.timeZone,
    );
    const busyIntervals = await this.getBusyIntervals({
      connectedAccount,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      timeZone,
    });

    return {
      available: !this.hasOverlap(busyIntervals, input.startsAt, input.endsAt),
      timeZone,
      busyIntervals,
    };
  }

  async bookMeeting(
    input: BookCrmLeadMeetingInput,
    workspaceId: string,
  ): Promise<BookCrmLeadMeetingOutput> {
    this.validateTimeWindow(input.startsAt, input.endsAt);

    const { ownerWorkspaceMember, connectedAccount } =
      await this.resolveOwnerCalendar(
        input.ownerWorkspaceMemberId,
        workspaceId,
      );
    const employeeWorkspaceMember =
      await this.userWorkspaceService.getWorkspaceMemberOrThrow({
        workspaceMemberId: input.employeeWorkspaceMemberId,
        workspaceId,
      });

    const employeeEmail = employeeWorkspaceMember.userEmail?.trim();

    if (!employeeEmail) {
      throw new BadRequestException(
        'The assigned employee must have an email address in their workspace profile before a meeting can be booked.',
      );
    }

    const leadRecord = await this.findLeadRecord(input.leadRecordId);
    const leadName =
      typeof leadRecord.name === 'string' ? leadRecord.name.trim() : '';

    if (!leadName) {
      throw new BadRequestException(
        'The selected Lead record must have a name before a meeting can be booked.',
      );
    }

    const leadEmails = leadRecord.emails as
      | { primaryEmail?: unknown }
      | null
      | undefined;
    const leadEmail =
      typeof leadEmails?.primaryEmail === 'string'
        ? leadEmails.primaryEmail.trim()
        : '';
    const leadCompany =
      typeof leadRecord.company === 'string' ? leadRecord.company.trim() : '';
    const leadServiceInterest =
      typeof leadRecord.serviceInterest === 'string'
        ? leadRecord.serviceInterest
        : '';
    const timeZone = this.resolveTimeZone(
      input.timeZone,
      ownerWorkspaceMember.timeZone,
    );
    const attendees = [
      ...new Set([employeeEmail, ...(leadEmail ? [leadEmail] : [])]),
    ];
    const description = [
      input.description?.trim(),
      leadCompany ? 'Company: ' + leadCompany : '',
      leadServiceInterest ? 'Service interest: ' + leadServiceInterest : '',
      'CRM lead record: ' + input.leadRecordId,
    ]
      .filter((value): value is string => Boolean(value))
      .join('\n\n');

    return this.dataSource.transaction(async (manager) => {
      // Serialize bookings for this owner's primary calendar. The lock is held
      // while we re-check Google FreeBusy and submit the event, so concurrent
      // CRM booking requests cannot both pass the same availability check.
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        'crm-lead-booking:' + workspaceId + ':' + connectedAccount.id,
      ]);

      const busyIntervals = await this.getBusyIntervals({
        connectedAccount,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        timeZone,
      });

      if (this.hasOverlap(busyIntervals, input.startsAt, input.endsAt)) {
        return {
          success: false,
          message:
            'This owner is no longer available for the selected time. Please choose another slot.',
          busyIntervals,
        };
      }

      const composedResult =
        await this.calendarEventComposerService.composeCalendarEvent(
          {
            connectedAccountId: connectedAccount.id,
            title: 'The Corent | ' + leadName,
            description,
            location: input.location,
            startsAt: input.startsAt,
            endsAt: input.endsAt,
            isFullDay: false,
            timeZone,
            attendees: attendees.join(','),
            sendInvitations: true,
            addConferencing: true,
          },
          workspaceId,
        );

      if (!composedResult.success) {
        throw new ServiceUnavailableException(
          'The owner calendar is not ready to create events. Check the Google Calendar connection and event permissions.',
        );
      }

      const createdEvent =
        await this.createCalendarEventService.createComposedCalendarEvent(
          composedResult.data,
        );
      const calendarEventId =
        await this.createCalendarEventService.persistCalendarEvent(
          createdEvent,
          composedResult.data,
          workspaceId,
        );
      const followUpDateUpdated = await this.updateLeadNextFollowUpAt({
        leadRecordId: input.leadRecordId,
        startsAt: input.startsAt,
      });

      return {
        success: true,
        message:
          'Meeting booked. The event was added to the owner calendar and invitations were sent to the employee' +
          (leadEmail ? ' and lead.' : '.') +
          (followUpDateUpdated
            ? ' The Lead next follow-up date was updated.'
            : ' The meeting is booked, but your role could not update the Lead next follow-up date.'),
        calendarEventId: calendarEventId ?? undefined,
        conferenceLink: createdEvent.conferenceLinkUrl || undefined,
        busyIntervals: [],
      };
    });
  }

  private async updateLeadNextFollowUpAt({
    leadRecordId,
    startsAt,
  }: {
    leadRecordId: string;
    startsAt: string;
  }): Promise<boolean> {
    try {
      return await this.workspaceOrmManager.executeInWorkspaceContext(
        async () => {
          const leadRepository =
            this.workspaceOrmManager.getRepository<ObjectRecord>('lead');

          if (!leadRepository.isObjectOperationPermittedByRole('update')) {
            return false;
          }

          await leadRepository.update(
            { id: leadRecordId },
            { nextFollowUpAt: startsAt },
          );

          return true;
        },
      );
    } catch (error) {
      this.logger.warn(
        `Unable to update the next follow-up date for Lead ${leadRecordId}: ${error instanceof Error ? error.message : String(error)}`,
      );

      return false;
    }
  }

  private async findLeadRecord(leadRecordId: string): Promise<ObjectRecord> {
    const leadRecord = await this.workspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const leadRepository =
          this.workspaceOrmManager.getRepository<ObjectRecord>('lead');

        if (!leadRepository.isObjectOperationPermittedByRole('select')) {
          throw new ForbiddenException(
            'You do not have permission to view this Lead record.',
          );
        }

        return leadRepository.findOne({
          where: { id: leadRecordId },
        });
      },
    );

    if (!leadRecord) {
      throw new NotFoundException(
        'The selected Lead record was not found or is not accessible in this workspace.',
      );
    }

    return leadRecord;
  }

  private async resolveOwnerCalendar(
    ownerWorkspaceMemberId: string,
    workspaceId: string,
  ): Promise<OwnerCalendarContext> {
    const ownerWorkspaceMember =
      await this.userWorkspaceService.getWorkspaceMemberOrThrow({
        workspaceMemberId: ownerWorkspaceMemberId,
        workspaceId,
      });
    const ownerUserWorkspace =
      await this.userWorkspaceService.getUserWorkspaceForUserOrThrow({
        userId: ownerWorkspaceMember.userId,
        workspaceId,
        relations: [],
      });
    const connectedAccounts = await this.connectedAccountRepository.find({
      where: {
        workspaceId,
        userWorkspaceId: ownerUserWorkspace.id,
        provider: ConnectedAccountProvider.GOOGLE,
        scope: 'USER',
        archivedAt: IsNull(),
      },
      relations: { calendarChannels: true },
      order: { updatedAt: 'DESC' },
    });

    const ownerCalendar = connectedAccounts
      .map((connectedAccount) => ({
        connectedAccount,
        calendarChannel: connectedAccount.calendarChannels?.find(
          (calendarChannel) => calendarChannel.isSyncEnabled,
        ),
      }))
      .find(
        ({ connectedAccount, calendarChannel }) =>
          isDefined(calendarChannel) &&
          connectedAccount.scopes?.includes(GOOGLE_CALENDAR_EVENTS_SCOPE) &&
          connectedAccount.scopes?.some((scope) =>
            GOOGLE_CALENDAR_FREEBUSY_SCOPES.includes(scope),
          ),
      );

    if (isDefined(ownerCalendar)) {
      return {
        ownerWorkspaceMember,
        connectedAccount: ownerCalendar.connectedAccount,
      };
    }

    const hasSynchronizedCalendar = connectedAccounts.some((connectedAccount) =>
      connectedAccount.calendarChannels?.some(
        (calendarChannel) => calendarChannel.isSyncEnabled,
      ),
    );

    if (hasSynchronizedCalendar) {
      throw new ForbiddenException(
        'The selected owner must reconnect Google Calendar and grant event-creation and availability access before staff can book their calendar.',
      );
    }

    throw new BadRequestException(
      'The selected owner does not have a connected Google Calendar with calendar sync enabled.',
    );
  }

  private async getBusyIntervals({
    connectedAccount,
    startsAt,
    endsAt,
    timeZone,
  }: {
    connectedAccount: ConnectedAccountEntity;
    startsAt: string;
    endsAt: string;
    timeZone: string;
  }): Promise<CrmLeadCalendarBusyInterval[]> {
    const oAuth2Client = await this.googleOAuth2ClientProvider.getClient(
      connectedAccount.id,
    );
    const googleCalendarClient = google.calendar({
      version: 'v3',
      auth: oAuth2Client,
    });

    let response;

    try {
      response = await googleCalendarClient.freebusy.query({
        requestBody: {
          timeMin: startsAt,
          timeMax: endsAt,
          timeZone,
          items: [{ id: GOOGLE_PRIMARY_CALENDAR_ID }],
        },
      });
    } catch {
      throw new ServiceUnavailableException(
        'Google Calendar availability could not be checked. No booking was made.',
      );
    }

    const calendarAvailability =
      response.data.calendars?.[GOOGLE_PRIMARY_CALENDAR_ID];

    if (
      !calendarAvailability ||
      (calendarAvailability.errors?.length ?? 0) > 0
    ) {
      throw new ServiceUnavailableException(
        'Google Calendar did not return a reliable availability response. No booking was made.',
      );
    }

    return (calendarAvailability.busy ?? []).map((interval) => {
      if (!interval.start || !interval.end) {
        throw new ServiceUnavailableException(
          'Google Calendar returned an incomplete busy interval. No booking was made.',
        );
      }

      return {
        start: interval.start,
        end: interval.end,
      };
    });
  }

  private hasOverlap(
    busyIntervals: CrmLeadCalendarBusyInterval[],
    startsAt: string,
    endsAt: string,
  ): boolean {
    const requestedStart = Date.parse(startsAt);
    const requestedEnd = Date.parse(endsAt);

    return busyIntervals.some(
      (interval) =>
        Date.parse(interval.start) < requestedEnd &&
        Date.parse(interval.end) > requestedStart,
    );
  }

  private validateTimeWindow(startsAt: string, endsAt: string): void {
    const startsAtTimestamp = Date.parse(startsAt);
    const endsAtTimestamp = Date.parse(endsAt);

    if (
      !OFFSET_DATE_TIME_PATTERN.test(startsAt) ||
      !OFFSET_DATE_TIME_PATTERN.test(endsAt) ||
      Number.isNaN(startsAtTimestamp) ||
      Number.isNaN(endsAtTimestamp) ||
      endsAtTimestamp <= startsAtTimestamp
    ) {
      throw new BadRequestException(
        'Meeting start and end must be valid ISO 8601 date-times with an explicit timezone offset, and the end must be later than the start.',
      );
    }

    if (startsAtTimestamp <= Date.now()) {
      throw new BadRequestException('Meeting start must be in the future.');
    }

    if (endsAtTimestamp - startsAtTimestamp > MAX_CALENDAR_QUERY_WINDOW_MS) {
      throw new BadRequestException(
        'The requested calendar window cannot be longer than 31 days.',
      );
    }
  }

  private resolveTimeZone(
    requestedTimeZone: string | undefined,
    ownerTimeZone: string | null | undefined,
  ): string {
    const timeZone = resolveCalendarEventTimeZone(
      requestedTimeZone?.trim() || ownerTimeZone || undefined,
    );

    if (!isValidTimeZone(timeZone)) {
      throw new BadRequestException(
        'The selected timezone is not a valid IANA timezone.',
      );
    }

    return timeZone;
  }
}
