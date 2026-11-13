import { UseFilters, UseGuards, UsePipes } from '@nestjs/common';
import { Args, Mutation, Query } from '@nestjs/graphql';

import { PermissionFlagType } from 'twenty-shared/constants';

import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { AuthGraphqlApiExceptionFilter } from 'src/engine/core-modules/auth/filters/auth-graphql-api-exception.filter';
import { ResolverValidationPipe } from 'src/engine/core-modules/graphql/pipes/resolver-validation.pipe';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { AccessPolicyGuard } from 'src/engine/guards/access-policy.guard';
import {
  BookCrmLeadMeetingInput,
  BookCrmLeadMeetingOutput,
  CrmLeadCalendarAvailability,
  CrmLeadCalendarAvailabilityInput,
  CrmLeadCalendarOwner,
} from 'src/modules/calendar/calendar-event-creation-manager/dtos/crm-lead-calendar.input';
import { CrmLeadCalendarService } from 'src/modules/calendar/calendar-event-creation-manager/services/crm-lead-calendar.service';

@MetadataResolver()
@UsePipes(ResolverValidationPipe)
@UseFilters(AuthGraphqlApiExceptionFilter)
@UseGuards(
  AccessPolicyGuard({
    authPrincipals: {
      userSession: {
        standard: true,
        impersonated: true,
        playground: true,
        workspaceAgnostic: false,
      },
      apiKey: true,
      oauthClient: true,
      application: true,
    },
    requiredPermissionFlags: [PermissionFlagType.CREATE_CALENDAR_EVENT_TOOL],
  }),
)
export class CrmLeadCalendarResolver {
  constructor(
    private readonly crmLeadCalendarService: CrmLeadCalendarService,
  ) {}

  @Query(() => [CrmLeadCalendarOwner])
  async crmLeadCalendarOwners(
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<CrmLeadCalendarOwner[]> {
    return this.crmLeadCalendarService.getAvailableOwners(workspace.id);
  }

  @Query(() => CrmLeadCalendarAvailability)
  async crmLeadCalendarAvailability(
    @Args('input') input: CrmLeadCalendarAvailabilityInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<CrmLeadCalendarAvailability> {
    return this.crmLeadCalendarService.getAvailability(input, workspace.id);
  }

  @Mutation(() => BookCrmLeadMeetingOutput)
  async bookCrmLeadMeeting(
    @Args('input') input: BookCrmLeadMeetingInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<BookCrmLeadMeetingOutput> {
    return this.crmLeadCalendarService.bookMeeting(input, workspace.id);
  }
}
