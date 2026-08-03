import { SignupPrefillQueueService } from '@api/services/signup-prefill/signup-prefill-queue.service';
import { SIGNUP_PREFILL_QUEUE } from '@genfeedai/queue-contracts';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

/**
 * Producer half of the signup prefill queue.
 *
 * Kept separate from {@link SignupPrefillModule} on purpose: the Better Auth
 * provisioning path only needs to *enqueue*, and importing the full prefill
 * module there would drag the scraper, LLM dispatcher, and knowledge-base graph
 * into the auth boot path for a job that runs in the workers process.
 */
@Module({
  exports: [SignupPrefillQueueService],
  imports: [
    ConfigModule,
    LoggerModule,
    BullModule.registerQueue({
      defaultJobOptions: {
        attempts: 3,
        backoff: { delay: 15000, type: 'exponential' },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
      name: SIGNUP_PREFILL_QUEUE,
    }),
  ],
  providers: [SignupPrefillQueueService],
})
export class SignupPrefillQueueModule {}
