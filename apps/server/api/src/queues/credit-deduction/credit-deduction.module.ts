import { CreditDeductionQueueService } from '@api/queues/credit-deduction/credit-deduction-queue.service';
import { CREDIT_DEDUCTION_QUEUE } from '@genfeedai/queue-contracts';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

@Module({
  exports: [CreditDeductionQueueService],
  imports: [
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
      name: CREDIT_DEDUCTION_QUEUE,
    }),
  ],
  providers: [CreditDeductionQueueService],
})
export class CreditDeductionModule {}
