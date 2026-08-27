import { InsightGenerationQueueService } from '@server/queues/insight-generation/insight-generation-queue.service';
import { INSIGHT_GENERATION_QUEUE } from '@genfeedai/queue-contracts';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

@Module({
  exports: [InsightGenerationQueueService],
  imports: [
    ConfigModule,
    LoggerModule,
    BullModule.registerQueue({
      defaultJobOptions: {
        attempts: 3,
        backoff: { delay: 5000, type: 'exponential' },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
      name: INSIGHT_GENERATION_QUEUE,
    }),
  ],
  providers: [InsightGenerationQueueService],
})
export class InsightGenerationQueueModule {}
