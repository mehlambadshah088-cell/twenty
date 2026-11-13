import { useLazyQuery, useMutation, useQuery } from '@apollo/client/react';
import { useEffect, useMemo, useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import gql from 'graphql-tag';
import { doNotTranslate } from 'twenty-shared/i18n';

import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { type WorkspaceMember } from '@/workspace-member/types/WorkspaceMember';
import { Badge } from 'twenty-ui/primitives/data-display';
import { Button, Field, Input, Select } from 'twenty-ui/primitives/input';
import { Dialog } from 'twenty-ui/primitives/surfaces';
import { Text } from 'twenty-ui/primitives/typography';
import { IconCalendarTime, IconVideo } from 'twenty-ui/icon';

type BusyInterval = {
  start: string;
  end: string;
};

type CalendarOwner = {
  id: string;
  name: string;
  email: string;
  timeZone?: string | null;
};

type CalendarOwnersData = {
  crmLeadCalendarOwners: CalendarOwner[];
};

type AvailabilityData = {
  crmLeadCalendarAvailability: {
    available: boolean;
    timeZone: string;
    busyIntervals: BusyInterval[];
  };
};

type AvailabilityVariables = {
  input: {
    ownerWorkspaceMemberId: string;
    startsAt: string;
    endsAt: string;
    timeZone: string;
  };
};

type BookingData = {
  bookCrmLeadMeeting: {
    success: boolean;
    message: string;
    calendarEventId?: string | null;
    conferenceLink?: string | null;
    busyIntervals: BusyInterval[];
  };
};

type BookingVariables = {
  input: {
    ownerWorkspaceMemberId: string;
    employeeWorkspaceMemberId: string;
    leadRecordId: string;
    startsAt: string;
    endsAt: string;
    timeZone: string;
    description?: string;
  };
};

const CRM_LEAD_CALENDAR_OWNERS = gql(
  doNotTranslate(
    'query CrmLeadCalendarOwners { crmLeadCalendarOwners { id name email timeZone } }',
  ),
);

const CRM_LEAD_CALENDAR_AVAILABILITY = gql(
  doNotTranslate(
    'query CrmLeadCalendarAvailability($input: CrmLeadCalendarAvailabilityInput!) { crmLeadCalendarAvailability(input: $input) { available timeZone busyIntervals { start end } } }',
  ),
);

const BOOK_CRM_LEAD_MEETING = gql(
  doNotTranslate(
    'mutation BookCrmLeadMeeting($input: BookCrmLeadMeetingInput!) { bookCrmLeadMeeting(input: $input) { success message calendarEventId conferenceLink busyIntervals { start end } } }',
  ),
);

const formatLocalDateTime = (date: Date): string => {
  const offsetMilliseconds = date.getTimezoneOffset() * 60 * 1000;

  return new Date(date.getTime() - offsetMilliseconds)
    .toISOString()
    .slice(0, 16);
};

const toIsoDateTime = (value: string, invalidMessage: string): string => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(invalidMessage);
  }

  return date.toISOString();
};

const formatBusyTime = (value: string, timeZone: string): string =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(value));

const getMemberLabel = (member: WorkspaceMember): string => {
  const fullName =
    [member.name.firstName, member.name.lastName].filter(Boolean).join(' ') ||
    member.userEmail;

  return fullName + ' · ' + member.userEmail;
};

export const ScheduleLeadMeetingButton = ({
  leadRecordId,
}: {
  leadRecordId: string;
}) => {
  const { t } = useLingui();
  const apolloCoreClient = useApolloCoreClient();
  const currentWorkspaceMember = useAtomStateValue(currentWorkspaceMemberState);
  const { data: calendarOwnersData, loading: loadingOwners } =
    useQuery<CalendarOwnersData>(CRM_LEAD_CALENDAR_OWNERS, {
      client: apolloCoreClient,
      fetchPolicy: 'network-only',
    });
  const calendarOwners = calendarOwnersData?.crmLeadCalendarOwners ?? [];
  const { records: workspaceMembers, loading: loadingMembers } =
    useFindManyRecords<WorkspaceMember>({
      objectNameSingular: 'workspaceMember',
      limit: 100,
    });

  const [open, setOpen] = useState(false);
  const [ownerWorkspaceMemberId, setOwnerWorkspaceMemberId] = useState('');
  const [employeeWorkspaceMemberId, setEmployeeWorkspaceMemberId] =
    useState('');
  const [startsAtLocal, setStartsAtLocal] = useState(() =>
    formatLocalDateTime(new Date(Date.now() + 30 * 60 * 1000)),
  );
  const [endsAtLocal, setEndsAtLocal] = useState(() =>
    formatLocalDateTime(new Date(Date.now() + 90 * 60 * 1000)),
  );
  const [description, setDescription] = useState('');
  const [availabilityChecked, setAvailabilityChecked] = useState(false);
  const [bookingMessage, setBookingMessage] = useState<{
    success: boolean;
    message: string;
    conferenceLink?: string | null;
    busyIntervals?: BusyInterval[];
  } | null>(null);

  const ownerOptions = useMemo(
    () =>
      calendarOwners.map((owner) => ({
        value: owner.id,
        label: owner.name + ' · ' + owner.email,
      })),
    [calendarOwners],
  );

  const employeeOptions = useMemo(
    () =>
      workspaceMembers
        .filter((member) => Boolean(member.userEmail))
        .map((member) => ({
          value: member.id,
          label: getMemberLabel(member),
        })),
    [workspaceMembers],
  );

  const selectedOwner = calendarOwners.find(
    (owner) => owner.id === ownerWorkspaceMemberId,
  );
  const timeZone =
    selectedOwner?.timeZone ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    doNotTranslate('UTC');

  const [
    checkAvailability,
    {
      data: availabilityData,
      loading: checkingAvailability,
      error: availabilityError,
    },
  ] = useLazyQuery<AvailabilityData, AvailabilityVariables>(
    CRM_LEAD_CALENDAR_AVAILABILITY,
    {
      client: apolloCoreClient,
      fetchPolicy: 'network-only',
    },
  );

  const [bookMeeting, { loading: booking }] = useMutation<
    BookingData,
    BookingVariables
  >(BOOK_CRM_LEAD_MEETING, {
    client: apolloCoreClient,
  });

  const availability = availabilityData?.crmLeadCalendarAvailability;

  useEffect(() => {
    if (!open) {
      return;
    }

    if (!ownerWorkspaceMemberId && ownerOptions.length > 0) {
      setOwnerWorkspaceMemberId(ownerOptions[0].value);
    }

    if (currentWorkspaceMember?.id && !employeeWorkspaceMemberId) {
      setEmployeeWorkspaceMemberId(currentWorkspaceMember.id);
    }
  }, [
    currentWorkspaceMember?.id,
    employeeWorkspaceMemberId,
    open,
    ownerOptions,
    ownerWorkspaceMemberId,
  ]);

  const resetCheck = () => {
    setAvailabilityChecked(false);
    setBookingMessage(null);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);

    if (nextOpen) {
      if (!ownerWorkspaceMemberId && ownerOptions.length > 0) {
        setOwnerWorkspaceMemberId(ownerOptions[0].value);
      }

      if (currentWorkspaceMember?.id && !employeeWorkspaceMemberId) {
        setEmployeeWorkspaceMemberId(currentWorkspaceMember.id);
      }
    } else {
      setAvailabilityChecked(false);
      setBookingMessage(null);
    }
  };

  const handleCheckAvailability = async () => {
    if (!ownerWorkspaceMemberId || !startsAtLocal || !endsAtLocal) {
      setBookingMessage({
        success: false,
        message: t`Choose a meeting owner, start time, and end time first.`,
      });

      return;
    }

    try {
      const response = await checkAvailability({
        variables: {
          input: {
            ownerWorkspaceMemberId,
            startsAt: toIsoDateTime(
              startsAtLocal,
              t`Enter a valid meeting date and time.`,
            ),
            endsAt: toIsoDateTime(
              endsAtLocal,
              t`Enter a valid meeting date and time.`,
            ),
            timeZone,
          },
        },
      });

      setAvailabilityChecked(
        Boolean(response.data?.crmLeadCalendarAvailability),
      );
      setBookingMessage(null);
    } catch (error) {
      setAvailabilityChecked(false);
      setBookingMessage({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : t`Could not check the owner calendar.`,
      });
    }
  };

  const handleBookMeeting = async () => {
    if (
      !ownerWorkspaceMemberId ||
      !employeeWorkspaceMemberId ||
      !availability?.available
    ) {
      return;
    }

    try {
      const response = await bookMeeting({
        variables: {
          input: {
            ownerWorkspaceMemberId,
            employeeWorkspaceMemberId,
            leadRecordId,
            startsAt: toIsoDateTime(
              startsAtLocal,
              t`Enter a valid meeting date and time.`,
            ),
            endsAt: toIsoDateTime(
              endsAtLocal,
              t`Enter a valid meeting date and time.`,
            ),
            timeZone,
            description: description.trim() || undefined,
          },
        },
      });

      const result = response.data?.bookCrmLeadMeeting;

      if (!result) {
        setAvailabilityChecked(false);
        setBookingMessage({
          success: false,
          message: t`The meeting booking did not return a result.`,
        });

        return;
      }

      setAvailabilityChecked(false);
      setBookingMessage({
        success: result.success,
        message: result.message,
        conferenceLink: result.conferenceLink,
        busyIntervals: result.busyIntervals,
      });
    } catch (error) {
      setAvailabilityChecked(false);
      setBookingMessage({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : t`Could not book the meeting.`,
      });
    }
  };

  const availabilityStatus =
    availabilityChecked && availability
      ? availability.available
        ? 'available'
        : 'busy'
      : 'unchecked';

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger
        render={
          <Button variant="outline" size="sm" startIcon={<IconCalendarTime />}>
            <Trans>Schedule meeting</Trans>
          </Button>
        }
      />
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Viewport>
          <Dialog.Popup size="lg">
            <Dialog.Header>
              <Dialog.Title>
                <Trans>Schedule a lead meeting</Trans>
              </Dialog.Title>
              <Dialog.Description>
                <Trans>
                  Check the owner’s Google Calendar before booking. Invitations
                  are sent to the selected employee and lead when an email is
                  available.
                </Trans>
              </Dialog.Description>
            </Dialog.Header>
            <Dialog.Body>
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
              >
                {ownerOptions.length === 0 && !loadingOwners && (
                  <Text size="sm">
                    <Trans>
                      No owners with a connected Google Calendar are available.
                      Ask an owner to connect Google Calendar and grant
                      availability access.
                    </Trans>
                  </Text>
                )}

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                    gap: 16,
                  }}
                >
                  <Field.Root name="ownerWorkspaceMemberId">
                    <Field.Label>
                      <Trans>Meeting owner</Trans>
                    </Field.Label>
                    <Select.Root
                      value={ownerWorkspaceMemberId || null}
                      onValueChange={(value) => {
                        setOwnerWorkspaceMemberId(value ?? '');
                        resetCheck();
                      }}
                      items={ownerOptions}
                    >
                      <Select.Trigger>
                        <Select.Value
                          placeholder={
                            loadingOwners
                              ? t`Loading connected owner calendars…`
                              : t`Select owner`
                          }
                        />
                        <Select.Icon />
                      </Select.Trigger>
                      <Select.Portal>
                        <Select.Positioner align="start" sideOffset={4}>
                          <Select.Popup>
                            {ownerOptions.map((option) => (
                              <Select.Item
                                key={option.value}
                                value={option.value}
                              >
                                <Select.ItemText>
                                  {option.label}
                                </Select.ItemText>
                                <Select.ItemIndicator />
                              </Select.Item>
                            ))}
                          </Select.Popup>
                        </Select.Positioner>
                      </Select.Portal>
                    </Select.Root>
                  </Field.Root>
                  <Field.Root name="employeeWorkspaceMemberId">
                    <Field.Label>
                      <Trans>Assigned employee</Trans>
                    </Field.Label>
                    <Select.Root
                      value={employeeWorkspaceMemberId || null}
                      onValueChange={(value) => {
                        setEmployeeWorkspaceMemberId(value ?? '');
                        resetCheck();
                      }}
                      items={employeeOptions}
                    >
                      <Select.Trigger>
                        <Select.Value
                          placeholder={
                            loadingMembers
                              ? t`Loading team members…`
                              : t`Select employee`
                          }
                        />
                        <Select.Icon />
                      </Select.Trigger>
                      <Select.Portal>
                        <Select.Positioner align="start" sideOffset={4}>
                          <Select.Popup>
                            {employeeOptions.map((option) => (
                              <Select.Item
                                key={option.value}
                                value={option.value}
                              >
                                <Select.ItemText>
                                  {option.label}
                                </Select.ItemText>
                                <Select.ItemIndicator />
                              </Select.Item>
                            ))}
                          </Select.Popup>
                        </Select.Positioner>
                      </Select.Portal>
                    </Select.Root>
                  </Field.Root>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                    gap: 16,
                  }}
                >
                  <Field.Root name="startsAt">
                    <Field.Label>
                      <Trans>Start</Trans>
                    </Field.Label>
                    <Input
                      type="datetime-local"
                      value={startsAtLocal}
                      onChange={(event) => {
                        setStartsAtLocal(event.target.value);
                        resetCheck();
                      }}
                    />
                  </Field.Root>
                  <Field.Root name="endsAt">
                    <Field.Label>
                      <Trans>End</Trans>
                    </Field.Label>
                    <Input
                      type="datetime-local"
                      value={endsAtLocal}
                      onChange={(event) => {
                        setEndsAtLocal(event.target.value);
                        resetCheck();
                      }}
                    />
                  </Field.Root>
                </div>

                <Field.Root name="description">
                  <Field.Label>
                    <Trans>Meeting notes (optional)</Trans>
                  </Field.Label>
                  <Input
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder={t`Agenda or context for the meeting`}
                  />
                </Field.Root>

                <Text size="sm">
                  <Trans>
                    Date and time inputs use your browser timezone (
                    {Intl.DateTimeFormat().resolvedOptions().timeZone}). Owner
                    availability is displayed in {timeZone}. Google Meet
                    conferencing is requested automatically.
                  </Trans>
                </Text>

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    border: '1px solid var(--t-border-color-light)',
                    borderRadius: 8,
                    padding: 12,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}
                  >
                    <Text weight="medium">
                      <Trans>Calendar availability</Trans>
                    </Text>
                    {availabilityStatus === 'available' && (
                      <Badge color="primary">
                        <Trans>Available</Trans>
                      </Badge>
                    )}
                    {availabilityStatus === 'busy' && (
                      <Badge color="red">
                        <Trans>Busy</Trans>
                      </Badge>
                    )}
                    {availabilityStatus === 'unchecked' && (
                      <Badge color="secondary">
                        <Trans>Not checked</Trans>
                      </Badge>
                    )}
                  </div>

                  {availabilityChecked && availability?.busyIntervals.length ? (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                      }}
                    >
                      <Text size="sm">
                        <Trans>Busy intervals in this window</Trans>
                      </Text>
                      {availability.busyIntervals.map((interval) => (
                        <Text key={interval.start + interval.end} size="sm">
                          {formatBusyTime(interval.start, timeZone)} –{' '}
                          {formatBusyTime(interval.end, timeZone)}
                        </Text>
                      ))}
                    </div>
                  ) : availabilityStatus === 'available' ? (
                    <Text size="sm">
                      <Trans>No conflicts found for this time.</Trans>
                    </Text>
                  ) : null}

                  {availabilityError && (
                    <Text size="sm">{availabilityError.message}</Text>
                  )}

                  {bookingMessage && (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                        borderRadius: 8,
                        padding: 10,
                        border: '1px solid var(--t-border-color-light)',
                      }}
                    >
                      <Text size="sm">{bookingMessage.message}</Text>
                      {bookingMessage.busyIntervals?.length ? (
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 4,
                          }}
                        >
                          {bookingMessage.busyIntervals.map((interval) => (
                            <Text key={interval.start + interval.end} size="sm">
                              {formatBusyTime(interval.start, timeZone)} –{' '}
                              {formatBusyTime(interval.end, timeZone)}
                            </Text>
                          ))}
                        </div>
                      ) : null}
                      {bookingMessage.conferenceLink && (
                        <a
                          href={bookingMessage.conferenceLink}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Text size="sm">
                            <Trans>Open Google Meet</Trans>
                          </Text>
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Dialog.Body>
            <Dialog.Footer>
              <Dialog.Close
                render={
                  <Button variant="outline">
                    <Trans>Close</Trans>
                  </Button>
                }
              />
              <Button
                variant="outline"
                loading={checkingAvailability}
                disabled={
                  !ownerWorkspaceMemberId ||
                  !startsAtLocal ||
                  !endsAtLocal ||
                  booking
                }
                onClick={handleCheckAvailability}
              >
                <Trans>Check availability</Trans>
              </Button>
              <Button
                loading={booking}
                disabled={
                  !availabilityChecked ||
                  !availability?.available ||
                  !employeeWorkspaceMemberId ||
                  booking
                }
                startIcon={<IconVideo />}
                onClick={handleBookMeeting}
              >
                <Trans>Book meeting</Trans>
              </Button>
            </Dialog.Footer>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
