import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { LIFECYCLE_EMAIL_QUEUE } from '@genfeedai/queue-contracts';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { LifecycleEmailService } from './lifecycle-email.service';
import { LifecycleEmailQueueService } from './lifecycle-email-queue.service';
import { LifecycleEmailsController } from './lifecycle-emails.controller';

@Module({
  controllers: [LifecycleEmailsController],
  exports: [LifecycleEmailService],
  imports: [
    ConfigModule,
    LoggerModule,
    NotificationsModule,
    BullModule.registerQueue({
      defaultJobOptions: {
        attempts: 3,
        backoff: { delay: 10000, type: 'exponential' },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
      name: LIFECYCLE_EMAIL_QUEUE,
    }),
  ],
  providers: [LifecycleEmailQueueService, LifecycleEmailService],
})
export class LifecycleEmailsModule {}
