import { NotificationsService } from '@api/services/notifications/notifications.service';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ConfigModule } from '@libs/config/config.module';
import { ConfigService } from '@libs/config/config.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { LoggerService } from '@libs/logger/logger.service';
import { Module } from '@nestjs/common';
import { SERVER_TOKENS } from '@server/server.dependencies';
import { LifecycleEmailDeliveryService } from '@server/services/lifecycle-emails/lifecycle-email-delivery.service';

@Module({
  exports: [LifecycleEmailDeliveryService, NotificationsService],
  imports: [ConfigModule, LoggerModule, PrismaModule],
  providers: [
    NotificationsService,
    LifecycleEmailDeliveryService,
    {
      provide: SERVER_TOKENS.config,
      useExisting: ConfigService,
    },
    {
      provide: SERVER_TOKENS.logger,
      useExisting: LoggerService,
    },
    {
      provide: SERVER_TOKENS.notifications,
      useExisting: NotificationsService,
    },
    {
      provide: SERVER_TOKENS.prisma,
      useExisting: PrismaService,
    },
  ],
})
export class NotificationsModule {}
