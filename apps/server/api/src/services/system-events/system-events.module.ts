import { CredentialCryptoService } from '@api/collections/credentials/services/credential-crypto.service';
import { PlatformSettingsModule } from '@api/collections/platform-settings/platform-settings.module';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { SystemEventDeliveryService } from '@api/services/system-events/system-event-delivery.service';
import { SystemEventsService } from '@api/services/system-events/system-events.service';
import { SystemNotificationDestinationsService } from '@api/services/system-events/system-notification-destinations.service';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    LoggerModule,
    NotificationsModule,
    PlatformSettingsModule,
  ],
  providers: [
    SystemEventsService,
    SystemEventDeliveryService,
    SystemNotificationDestinationsService,
    CredentialCryptoService,
  ],
  exports: [SystemEventsService, SystemNotificationDestinationsService],
})
export class SystemEventsModule {}
