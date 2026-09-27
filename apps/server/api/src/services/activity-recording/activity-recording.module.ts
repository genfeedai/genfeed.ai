import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { WorkflowNotificationQueueService } from '@api/services/notifications/workflow-notifications/workflow-notification-queue.service';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { NOTIFICATION_DELIVERY_QUEUE } from '@genfeedai/contracts/queue';
import { LoggerModule } from '@libs/logger/logger.module';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

/** The one recording API for activities and their alerts (#5197). */
@Module({
  exports: [ActivityRecorderService],
  imports: [
    LoggerModule,
    NotificationsPublisherModule,
    PrismaModule,
    BullModule.registerQueue({
      defaultJobOptions: {
        removeOnComplete: 500,
        removeOnFail: 200,
      },
      name: NOTIFICATION_DELIVERY_QUEUE,
    }),
  ],
  providers: [ActivityRecorderService, WorkflowNotificationQueueService],
})
export class ActivityRecordingModule {}
