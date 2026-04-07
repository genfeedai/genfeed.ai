/**
 * Workers Queues Module
 *
 * Registers all BullMQ queues consumed by workers (both cron-triggered
 * and processor-consumed). Queue job options mirror the API-side
 * registrations to ensure consistent retry/backoff behaviour.
 */

import { CLIP_ANALYZE_QUEUE } from '@api/queues/clip-analyze/clip-analyze.constants';
import { CLIP_FACTORY_QUEUE } from '@api/queues/clip-factory/clip-factory.constants';
import { QueueService } from '@api/queues/core/queue.service';
import {
  CAMPAIGN_MEMORY_EXTRACTION_QUEUE,
  ORCHESTRATOR_RUN_QUEUE,
  TRIGGER_EVALUATION_QUEUE,
} from '@api/services/agent-campaign/orchestrator.constants';
import {
  buildBullMQConnection,
  parseRedisConnection,
} from '@libs/redis/redis-connection.utils';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@workers/config/config.module';
import { ConfigService } from '@workers/config/config.service';

@Module({
  exports: [QueueService],
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const config = parseRedisConnection(configService);
        return { connection: buildBullMQConnection(config) };
      },
    }),
    BullModule.registerQueue(
      // ---------- Existing queues (crons + processors) ----------
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 2000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: 'default',
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 5000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: 'analytics-twitter',
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 2000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: 'analytics-youtube',
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 2000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: 'analytics-social',
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 5000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: 'ad-sync-meta',
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 5000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: 'ad-sync-google',
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 5000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: 'ad-sync-tiktok',
      },
      {
        defaultJobOptions: {
          attempts: 2,
          backoff: { delay: 10000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: 'ad-insights-aggregation',
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 5000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: 'analytics-sync',
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 10000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: 'email-digest',
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 5000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: 'ad-bulk-upload',
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 5000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: 'ad-optimization',
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 5000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: 'telegram-distribute',
      },
      {
        defaultJobOptions: {
          attempts: 2,
          backoff: { delay: 10000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: 'pattern-extraction',
      },

      // ---------- Newly registered queues (moved from API) ----------
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 10000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: 'reply-bot-polling',
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 30000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: 'campaign-processing',
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 5000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: 'workflow-execution',
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 10000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: 'workflow-delay',
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 5000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: 'agent-run',
      },
      {
        defaultJobOptions: {
          attempts: 2,
          backoff: { delay: 5000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: 'workspace-task',
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 2000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 200,
        },
        name: 'credit-deduction',
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 1000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: 'batch-content',
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 10000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: 'content-optimization',
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 10000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: 'content-pipeline',
      },
      {
        defaultJobOptions: {
          attempts: 5,
          backoff: { delay: 3000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 200,
        },
        name: 'webhook-client',
      },
      {
        defaultJobOptions: {
          attempts: 2,
          backoff: { delay: 30000, type: 'exponential' },
          removeOnComplete: 50,
          removeOnFail: 25,
        },
        name: 'article-generation',
      },
      {
        defaultJobOptions: {
          attempts: 2,
          backoff: { delay: 30000, type: 'exponential' },
          removeOnComplete: 50,
          removeOnFail: 25,
        },
        name: CLIP_ANALYZE_QUEUE,
      },
      {
        defaultJobOptions: {
          attempts: 2,
          backoff: { delay: 30000, type: 'exponential' },
          removeOnComplete: 50,
          removeOnFail: 25,
        },
        name: CLIP_FACTORY_QUEUE,
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 10000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: ORCHESTRATOR_RUN_QUEUE,
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 10000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: CAMPAIGN_MEMORY_EXTRACTION_QUEUE,
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 5000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: TRIGGER_EVALUATION_QUEUE,
      },
      // Note: collections/workflows WorkflowExecutionProcessor also listens on
      // 'workflow-execution' — both processors share the same queue (registered above).
      {
        defaultJobOptions: {
          attempts: 2,
          backoff: { delay: 5000, type: 'exponential' },
          removeOnComplete: 200,
          removeOnFail: 100,
        },
        name: 'batch-workflow',
      },
    ),
  ],
  providers: [QueueService],
})
export class WorkersQueuesModule {}
