/**
 * Queues Module
 *
 * BullMQ job queue management: configure Redis-backed queues for async
 * processing. This module is the producer side — it registers queue
 * definitions and queue services that enqueue jobs.
 *
 * All @Processor consumers have been moved to the Workers service
 * (ProcessorsModule) as of issue #84 to prevent heavy jobs from
 * competing with HTTP request handling for CPU time.
 */

import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { OutreachCampaignsModule } from '@api/collections/outreach-campaigns/outreach-campaigns.module';
import { ReplyBotConfigsModule } from '@api/collections/reply-bot-configs/reply-bot-configs.module';
import { WorkflowExecutionsModule } from '@api/collections/workflow-executions/workflow-executions.module';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { ConfigModule } from '@api/config/config.module';
import { ConfigService } from '@api/config/config.service';
import { AgentRunQueueService } from '@api/queues/agent-run/agent-run-queue.service';
import { CampaignQueueService } from '@api/queues/campaign/campaign-queue.service';
import { QueueService } from '@api/queues/core/queue.service';
import { ReplyBotQueueService } from '@api/queues/reply-bot/reply-bot-queue.service';
import { WorkflowQueueService } from '@api/queues/workflow/workflow-queue.service';
import { WorkspaceTaskQueueService } from '@api/services/task-orchestration/workspace-task-queue.service';
import {
  buildBullMQConnection,
  parseRedisConnection,
} from '@libs/redis/redis-connection.utils';
import { BullModule } from '@nestjs/bullmq';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  exports: [
    AgentRunQueueService,
    QueueService,
    ReplyBotQueueService,
    CampaignQueueService,
    WorkflowQueueService,
    WorkspaceTaskQueueService,
  ],
  imports: [
    // Modules needed by queue services (producers)
    forwardRef(() => CredentialsModule),
    forwardRef(() => OrganizationsModule),
    forwardRef(() => OutreachCampaignsModule),
    forwardRef(() => ReplyBotConfigsModule),
    forwardRef(() => WorkflowsModule),
    forwardRef(() => WorkflowExecutionsModule),

    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const config = parseRedisConnection(configService);
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
          backoff: { delay: 10000, type: 'exponential' },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: 'pattern-extraction',
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
    ),
  ],
  providers: [
    QueueService,
    ReplyBotQueueService,
    CampaignQueueService,
    WorkflowQueueService,
    AgentRunQueueService,
    WorkspaceTaskQueueService,
  ],
})
export class QueuesModule {}
