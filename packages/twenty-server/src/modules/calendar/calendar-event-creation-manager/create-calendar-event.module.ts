import { Module } from '@nestjs/common';

import { ConnectedAccountMetadataModule } from 'src/engine/metadata-modules/connected-account/connected-account-metadata.module';
import { PermissionsModule } from 'src/engine/permissions/permissions.module';
import { CalendarEventCreationManagerModule } from 'src/modules/calendar/calendar-event-creation-manager/calendar-event-creation-manager.module';
import { CreateCalendarEventResolver } from 'src/modules/calendar/calendar-event-creation-manager/resolvers/create-calendar-event.resolver';
import { CrmLeadCalendarResolver } from 'src/modules/calendar/calendar-event-creation-manager/resolvers/crm-lead-calendar.resolver';

@Module({
  imports: [
    CalendarEventCreationManagerModule,
    ConnectedAccountMetadataModule,
    PermissionsModule,
  ],
  providers: [CreateCalendarEventResolver, CrmLeadCalendarResolver],
})
export class CreateCalendarEventModule {}
