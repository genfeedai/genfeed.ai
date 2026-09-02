import { SERVER_TOKENS } from '@api/server.dependencies';
import { LifecycleEmailDeliveryService } from '@api/services/lifecycle-emails/lifecycle-email-delivery.service';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { NotificationPreferenceService } from '@api/services/notifications/workflow-notifications/notification-preference.service';
import { WorkflowNotificationDeliveryService } from '@api/services/notifications/workflow-notifications/workflow-notification-delivery.service';
import { WorkflowNotificationOutboxService } from '@api/services/notifications/workflow-notifications/workflow-notification-outbox.service';
import { WorkflowNotificationQueueService } from '@api/services/notifications/workflow-notifications/workflow-notification-queue.service';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { NOTIFICATION_DELIVERY_QUEUE } from '@genfeedai/contracts/queue';
import { ConfigModule } from '@libs/config/config.module';
import { ConfigService } from '@libs/config/config.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { LoggerService } from '@libs/logger/logger.service';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

@Module({
  exports: [
    LifecycleEmailDeliveryService,
    NotificationPreferenceService,
    NotificationsService,
    WorkflowNotificationDeliveryService,
    WorkflowNotificationOutboxService,
    WorkflowNotificationQueueService,
  ],
  imports: [
    ConfigModule,
    LoggerModule,
    PrismaModule,
    BullModule.registerQueue({
      defaultJobOptions: {
        removeOnComplete: 500,
        removeOnFail: 200,
      },
      name: NOTIFICATION_DELIVERY_QUEUE,
    }),
  ],
  providers: [
    NotificationsService,
    LifecycleEmailDeliveryService,
    NotificationPreferenceService,
    WorkflowNotificationDeliveryService,
    WorkflowNotificationOutboxService,
    WorkflowNotificationQueueService,
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
