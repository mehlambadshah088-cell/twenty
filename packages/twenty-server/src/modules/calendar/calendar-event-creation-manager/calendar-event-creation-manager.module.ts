import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CalendarChannelEntity } from 'src/engine/metadata-modules/calendar-channel/entities/calendar-channel.entity';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { UserWorkspaceModule } from 'src/engine/core-modules/user-workspace/user-workspace.module';
import { CalDavCreateEventService } from 'src/modules/calendar/calendar-event-creation-manager/drivers/caldav/services/caldav-create-event.service';
import { GoogleCalendarCreateEventService } from 'src/modules/calendar/calendar-event-creation-manager/drivers/google-calendar/services/google-calendar-create-event.service';
import { MicrosoftCalendarCreateEventService } from 'src/modules/calendar/calendar-event-creation-manager/drivers/microsoft-calendar/services/microsoft-calendar-create-event.service';
import { CalendarEventComposerService } from 'src/modules/calendar/calendar-event-creation-manager/services/calendar-event-composer.service';
import { CreateCalendarEventService } from 'src/modules/calendar/calendar-event-creation-manager/services/create-calendar-event.service';
import { CrmLeadCalendarService } from 'src/modules/calendar/calendar-event-creation-manager/services/crm-lead-calendar.service';
import { CrmLeadCalendarResolver } from 'src/modules/calendar/calendar-event-creation-manager/resolvers/crm-lead-calendar.resolver';
import { CalDavDriverModule } from 'src/modules/calendar/calendar-event-import-manager/drivers/caldav/caldav-driver.module';
import { CalendarEventImportManagerModule } from 'src/modules/calendar/calendar-event-import-manager/calendar-event-import-manager.module';
import { OAuth2ClientManagerModule } from 'src/modules/connected-account/oauth2-client-manager/oauth2-client-manager.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ConnectedAccountEntity, CalendarChannelEntity]),
    OAuth2ClientManagerModule,
    UserWorkspaceModule,
    CalendarEventImportManagerModule,
    CalDavDriverModule,
  ],
  providers: [
    CrmLeadCalendarResolver,
    CalendarEventComposerService,
    CreateCalendarEventService,
    CrmLeadCalendarService,
    GoogleCalendarCreateEventService,
    MicrosoftCalendarCreateEventService,
    CalDavCreateEventService,
  ],
  exports: [
    CalendarEventComposerService,
    CreateCalendarEventService,
    CrmLeadCalendarService,
  ],
})
export class CalendarEventCreationManagerModule {}
