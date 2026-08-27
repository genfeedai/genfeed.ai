/**
 * Queues Module
 *
 * BullMQ queue registration and queue service providers for the API process.
 * Processor classes have been moved to the Workers service (issue #84) --
 * this module only registers queues and queue services so the API can
 * enqueue jobs without consuming them.
 */

import { OutreachCampaignsCoreModule } from '@api/collections/outreach-campaigns/outreach-campaigns-core.module';
import { AgentRunQueueService } from '@server/queues/agent-run/agent-run-queue.service';
import { BatchGenerationQueueService } from '@server/queues/batch-generation/batch-generation-queue.service';
import { CampaignQueueService } from '@server/queues/campaign/campaign-queue.service';
import { QueueService } from '@server/queues/core/queue.service';
import { QueueDiagnosticsController } from '@api/queues/core/queue-diagnostics.controller';
import { HeygenPollQueueService } from '@server/queues/heygen-poll/heygen-poll-queue.service';
import { ReplyBotQueueService } from '@api/queues/reply-bot/reply-bot-queue.service';
import { ReplyInboundQueueService } from '@server/queues/reply-bot/reply-inbound-queue.service';
import { SocialReplyCampaignQueueService } from '@server/queues/social-reply-campaign/social-reply-campaign-queue.service';
import { WorkspaceTaskQueueService } from '@server/services/task-orchestration/workspace-task-queue.service';
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
  BATCH_GENERATION_QUEUE,
  CAMPAIGN_PROCESSING_QUEUE,
  DEFAULT_QUEUE,
  EMAIL_DIGEST_QUEUE,
  HEYGEN_POLL_QUEUE,
  INSIGHT_GENERATION_QUEUE,
  LIFECYCLE_EMAIL_QUEUE,
  PATTERN_EXTRACTION_QUEUE,
  POST_PUBLISH_QUEUE,
  REPLY_BOT_POLLING_QUEUE,
  REPLY_INBOUND_QUEUE,
  REPLY_POST_WATCH_QUEUE,
  SIGNUP_PREFILL_QUEUE,
  SOCIAL_INBOX_SYNC_QUEUE,
  SOCIAL_REPLY_CAMPAIGN_QUEUE,
  TELEGRAM_DISTRIBUTE_QUEUE,
  WORKSPACE_TASK_QUEUE,
} from '@genfeedai/queue-contracts';
import { PostPublishQueueService, SERVER_TOKENS } from '@genfeedai/server';
import { ConfigModule } from '@libs/config/config.module';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  buildBullMQConnection,
  parseRedisConnectionForWorkload,
  RedisWorkload,
} from '@libs/redis/redis-connection.utils';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

@Module({
  exports: [
    AgentRunQueueService,
    BatchGenerationQueueService,
    HeygenPollQueueService,
    PostPublishQueueService,
    QueueService,
    ReplyBotQueueService,
    ReplyInboundQueueService,
    CampaignQueueService,
    SocialReplyCampaignQueueService,
    WorkspaceTaskQueueService,
  ],
  imports: [
    OutreachCampaignsCoreModule,
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
          backoff: { delay: 10000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: REPLY_BOT_POLLING_QUEUE,
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 5000, type: 'exponential' },
          removeOnComplete: 200,
          removeOnFail: 100,
        },
        name: REPLY_INBOUND_QUEUE,
      },
      {
        defaultJobOptions: {
          attempts: 2,
          backoff: { delay: 10000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: REPLY_POST_WATCH_QUEUE,
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
          backoff: { delay: 15000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: SIGNUP_PREFILL_QUEUE,
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 5000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: INSIGHT_GENERATION_QUEUE,
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
          attempts: 3,
          backoff: { delay: 5000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: AGENT_RUN_QUEUE,
      },
      {
        // Retries are owned by the resume path, not by BullMQ: a redelivered
        // whole-batch job would regenerate items the dead run already persisted.
        defaultJobOptions: {
          attempts: 1,
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: BATCH_GENERATION_QUEUE,
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
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 10000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: SOCIAL_INBOX_SYNC_QUEUE,
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { delay: 10000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: SOCIAL_REPLY_CAMPAIGN_QUEUE,
      },
    ),
  ],
  controllers: [QueueDiagnosticsController],
  providers: [
    QueueService,
    ReplyBotQueueService,
    ReplyInboundQueueService,
    CampaignQueueService,
    AgentRunQueueService,
    BatchGenerationQueueService,
    SocialReplyCampaignQueueService,
    WorkspaceTaskQueueService,
    HeygenPollQueueService,
    PostPublishQueueService,
    {
      provide: SERVER_TOKENS.logger,
      useExisting: LoggerService,
    },
  ],
})
export class QueuesModule {}
