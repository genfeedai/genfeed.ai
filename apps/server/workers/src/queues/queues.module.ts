/**
 * Workers Queues Module
 *
 * Registers all BullMQ queues consumed by workers (both cron-triggered
 * and processor-consumed). Queue job options mirror the API-side
 * registrations to ensure consistent retry/backoff behaviour.
 */

import { QueueService } from '@api/queues/core/queue.service';
import { HeygenPollQueueService } from '@api/queues/heygen-poll/heygen-poll-queue.service';
import { PostPublishQueueService } from '@api/queues/post-publish/post-publish-queue.service';
import { WorkspaceTaskQueueService } from '@api/services/task-orchestration/workspace-task-queue.service';
import {
  AD_BULK_UPLOAD_QUEUE,
  AD_OPTIMIZATION_QUEUE,
  AD_SYNC_GOOGLE_QUEUE,
  AD_SYNC_META_QUEUE,
  AD_SYNC_TIKTOK_QUEUE,
  AGENT_RUN_QUEUE,
  ANALYTICS_FACEBOOK_QUEUE,
  ANALYTICS_SOCIAL_QUEUE,
  ANALYTICS_SYNC_QUEUE,
  ANALYTICS_THREADS_QUEUE,
  ANALYTICS_TWITTER_QUEUE,
  ANALYTICS_YOUTUBE_QUEUE,
  ARTICLE_GENERATION_QUEUE,
  BATCH_CONTENT_QUEUE,
  BATCH_WORKFLOW_QUEUE,
  CAMPAIGN_MEMORY_EXTRACTION_QUEUE,
  CAMPAIGN_PROCESSING_QUEUE,
  CLIP_ANALYZE_QUEUE,
  CLIP_FACTORY_QUEUE,
  CONTENT_OPTIMIZATION_QUEUE,
  CONTENT_PIPELINE_QUEUE,
  CREDIT_DEDUCTION_QUEUE,
  DEFAULT_QUEUE,
  EMAIL_DIGEST_QUEUE,
  HEYGEN_POLL_QUEUE,
  LIFECYCLE_EMAIL_QUEUE,
  ORCHESTRATOR_RUN_QUEUE,
  PATTERN_EXTRACTION_QUEUE,
  POST_PUBLISH_QUEUE,
  REPLY_BOT_POLLING_QUEUE,
  TELEGRAM_DISTRIBUTE_QUEUE,
  TRIGGER_EVALUATION_QUEUE,
  WEBHOOK_CLIENT_QUEUE,
  WORKFLOW_EXECUTION_QUEUE,
  WORKSPACE_TASK_QUEUE,
} from '@genfeedai/queue-contracts';
import { LoggerModule } from '@libs/logger/logger.module';
import {
  buildBullMQConnection,
  parseRedisConnectionForWorkload,
  RedisWorkload,
} from '@libs/redis/redis-connection.utils';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@workers/config/config.module';
import { ConfigService } from '@workers/config/config.service';

@Module({
  exports: [
    QueueService,
    WorkspaceTaskQueueService,
    HeygenPollQueueService,
    PostPublishQueueService,
  ],
  imports: [
    LoggerModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const config = parseRedisConnectionForWorkload(
          configService,
          RedisWorkload.QUEUE,
        );
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
        name: DEFAULT_QUEUE,
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 5000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: ANALYTICS_TWITTER_QUEUE,
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 2000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: ANALYTICS_YOUTUBE_QUEUE,
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 2000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: ANALYTICS_SOCIAL_QUEUE,
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 5000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: AD_SYNC_META_QUEUE,
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 5000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: AD_SYNC_GOOGLE_QUEUE,
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 5000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: AD_SYNC_TIKTOK_QUEUE,
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 5000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: ANALYTICS_SYNC_QUEUE,
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 10000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: EMAIL_DIGEST_QUEUE,
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 10000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: LIFECYCLE_EMAIL_QUEUE,
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 5000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: AD_BULK_UPLOAD_QUEUE,
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 5000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: AD_OPTIMIZATION_QUEUE,
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 5000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: TELEGRAM_DISTRIBUTE_QUEUE,
      },
      {
        defaultJobOptions: {
          attempts: 2,
          backoff: { delay: 10000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: PATTERN_EXTRACTION_QUEUE,
      },
      {
        defaultJobOptions: {
          attempts: 1,
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: POST_PUBLISH_QUEUE,
      },

      // ---------- Newly registered queues (moved from API) ----------
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 10000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: REPLY_BOT_POLLING_QUEUE,
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 30000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: CAMPAIGN_PROCESSING_QUEUE,
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 5000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: WORKFLOW_EXECUTION_QUEUE,
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 5000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: AGENT_RUN_QUEUE,
      },
      {
        defaultJobOptions: {
          attempts: 2,
          backoff: { delay: 5000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: WORKSPACE_TASK_QUEUE,
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 2000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 200,
        },
        name: CREDIT_DEDUCTION_QUEUE,
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 1000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: BATCH_CONTENT_QUEUE,
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 10000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: CONTENT_OPTIMIZATION_QUEUE,
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 10000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: CONTENT_PIPELINE_QUEUE,
      },
      {
        defaultJobOptions: {
          attempts: 5,
          backoff: { delay: 3000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 200,
        },
        name: WEBHOOK_CLIENT_QUEUE,
      },
      {
        defaultJobOptions: {
          attempts: 2,
          backoff: { delay: 30000, type: 'exponential' },
          removeOnComplete: 50,
          removeOnFail: 25,
        },
        name: ARTICLE_GENERATION_QUEUE,
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
        name: BATCH_WORKFLOW_QUEUE,
      },
      {
        defaultJobOptions: {
          attempts: 2,
          backoff: { delay: 5000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: HEYGEN_POLL_QUEUE,
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 2000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: ANALYTICS_FACEBOOK_QUEUE,
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 2000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: ANALYTICS_THREADS_QUEUE,
      },
    ),
  ],
  providers: [
    QueueService,
    WorkspaceTaskQueueService,
    HeygenPollQueueService,
    PostPublishQueueService,
  ],
})
export class WorkersQueuesModule {}
