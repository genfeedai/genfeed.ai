import { KnowledgeSourceIngestQueueService } from '@server/queues/knowledge-source-ingest/knowledge-source-ingest-queue.service';
import { KNOWLEDGE_SOURCE_INGEST_QUEUE } from '@genfeedai/queue-contracts';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

@Module({
  exports: [KnowledgeSourceIngestQueueService],
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
      name: KNOWLEDGE_SOURCE_INGEST_QUEUE,
    }),
  ],
  providers: [KnowledgeSourceIngestQueueService],
})
export class KnowledgeSourceIngestQueueModule {}
