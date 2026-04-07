import { CreditsModule } from '@api/collections/credits/credits.module';
import { CreditDeductionQueueService } from '@api/queues/credit-deduction/credit-deduction-queue.service';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { BullModule } from '@nestjs/bullmq';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  exports: [CreditDeductionQueueService],
  imports: [
    forwardRef(() => CreditsModule),
    NotificationsModule,
    BullModule.registerQueue({
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          delay: 2000,
          type: 'exponential',
        },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
      name: 'credit-deduction',
    }),
  ],
  // CreditDeductionProcessor moved to workers ProcessorsModule (issue #84)
  providers: [CreditDeductionQueueService],
})
export class CreditDeductionModule {}
