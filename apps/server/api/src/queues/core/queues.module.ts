/**
 * Queues Module
 * BullMQ job queue management: configure Redis-backed queues for async processing,
 * job monitoring, rate limiting, and worker management.
 */

import { AdBulkUploadJobsModule } from '@api/collections/ad-bulk-upload-jobs/ad-bulk-upload-jobs.module';
import { AdCreativeMappingsModule } from '@api/collections/ad-creative-mappings/ad-creative-mappings.module';
import { AdOptimizationAuditLogsModule } from '@api/collections/ad-optimization-audit-logs/ad-optimization-audit-logs.module';
import { AdOptimizationConfigsModule } from '@api/collections/ad-optimization-configs/ad-optimization-configs.module';
import { AdOptimizationRecommendationsModule } from '@api/collections/ad-optimization-recommendations/ad-optimization-recommendations.module';
import { AdPerformanceModule } from '@api/collections/ad-performance/ad-performance.module';
import { AgentCampaignsModule } from '@api/collections/agent-campaigns/agent-campaigns.module';
import { AgentRunsModule } from '@api/collections/agent-runs/agent-runs.module';
import { AgentStrategiesModule } from '@api/collections/agent-strategies/agent-strategies.module';
import { CampaignTargetsModule } from '@api/collections/campaign-targets/campaign-targets.module';
import { ContentPerformanceModule } from '@api/collections/content-performance/content-performance.module';
import { CreativePatternsModule } from '@api/collections/creative-patterns/creative-patterns.module';
import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { OutreachCampaignsModule } from '@api/collections/outreach-campaigns/outreach-campaigns.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import { ReplyBotConfigsModule } from '@api/collections/reply-bot-configs/reply-bot-configs.module';
import { WorkflowExecutionsModule } from '@api/collections/workflow-executions/workflow-executions.module';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { WorkspaceTasksModule } from '@api/collections/workspace-tasks/workspace-tasks.module';
import { ConfigModule } from '@api/config/config.module';
import { ConfigService } from '@api/config/config.service';
import { AdBulkUploadProcessor } from '@api/queues/ad-bulk-upload/ad-bulk-upload.processor';
import { AdInsightsAggregationProcessor } from '@api/queues/ad-insights-aggregation/ad-insights-aggregation.processor';
import { AdOptimizationProcessor } from '@api/queues/ad-optimization/ad-optimization.processor';
import { AdSyncGoogleProcessor } from '@api/queues/ad-sync-google/ad-sync-google.processor';
import { AdSyncMetaProcessor } from '@api/queues/ad-sync-meta/ad-sync-meta.processor';
import { AdSyncTikTokProcessor } from '@api/queues/ad-sync-tiktok/ad-sync-tiktok.processor';
import { AgentRunProcessor } from '@api/queues/agent-run/agent-run.processor';
import { AgentRunQueueService } from '@api/queues/agent-run/agent-run-queue.service';
import { AnalyticsSyncProcessor } from '@api/queues/analytics-sync/analytics-sync.processor';
import { CampaignQueueService } from '@api/queues/campaign/campaign-queue.service';
import { QueueService } from '@api/queues/core/queue.service';
import { EmailDigestProcessor } from '@api/queues/email-digest/email-digest.processor';
import { PatternExtractionProcessor } from '@api/queues/pattern-extraction/pattern-extraction.processor';
import { ReplyBotQueueService } from '@api/queues/reply-bot/reply-bot-queue.service';
import { TelegramDistributeProcessor } from '@api/queues/telegram-distribute/telegram-distribute.processor';
import {
  WorkflowDelayProcessor,
  WorkflowExecutionProcessor,
} from '@api/queues/workflow/workflow-execution.processor';
import { WorkflowQueueService } from '@api/queues/workflow/workflow-queue.service';
import { AgentOrchestratorModule } from '@api/services/agent-orchestrator/agent-orchestrator.module';
import { AgentStreamPublisherModule } from '@api/services/agent-orchestrator/agent-stream-publisher.module';
import { CampaignModule } from '@api/services/campaign/campaign.module';
import { TelegramDistributionModule } from '@api/services/distribution/telegram/telegram-distribution.module';
import { InstagramModule } from '@api/services/integrations/instagram/instagram.module';
import { MetaAdsModule } from '@api/services/integrations/meta-ads/meta-ads.module';
import { PinterestModule } from '@api/services/integrations/pinterest/pinterest.module';
import { TiktokModule } from '@api/services/integrations/tiktok/tiktok.module';
import { TwitterModule } from '@api/services/integrations/twitter/twitter.module';
import { YoutubeModule } from '@api/services/integrations/youtube/youtube.module';
import { ReplyBotModule } from '@api/services/reply-bot/reply-bot.module';
import { TaskOrchestrationModule } from '@api/services/task-orchestration/task-orchestration.module';
import { WorkspaceTaskProcessor } from '@api/services/task-orchestration/workspace-task.processor';
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
    forwardRef(() => ContentPerformanceModule),
    forwardRef(() => CreativePatternsModule),
    forwardRef(() => CampaignModule),
    forwardRef(() => WorkflowsModule),
    forwardRef(() => WorkflowExecutionsModule),
    forwardRef(() => CampaignTargetsModule),
    forwardRef(() => OutreachCampaignsModule),
    forwardRef(() => CredentialsModule),
    forwardRef(() => InstagramModule),
    forwardRef(() => OrganizationsModule),
    forwardRef(() => PinterestModule),
    forwardRef(() => PostsModule),
    forwardRef(() => ReplyBotConfigsModule),
    forwardRef(() => ReplyBotModule),
    forwardRef(() => TiktokModule),
    forwardRef(() => TwitterModule),
    forwardRef(() => YoutubeModule),
    forwardRef(() => AdBulkUploadJobsModule),
    forwardRef(() => AdCreativeMappingsModule),
    forwardRef(() => MetaAdsModule),
    forwardRef(() => AdPerformanceModule),
    forwardRef(() => AdOptimizationConfigsModule),
    forwardRef(() => AdOptimizationRecommendationsModule),
    forwardRef(() => AdOptimizationAuditLogsModule),
    forwardRef(() => AgentCampaignsModule),
    forwardRef(() => AgentRunsModule),
    forwardRef(() => AgentStrategiesModule),
    forwardRef(() => AgentOrchestratorModule),
    AgentStreamPublisherModule,
    forwardRef(() => WorkspaceTasksModule),
    forwardRef(() => TaskOrchestrationModule),
    forwardRef(() => TelegramDistributionModule),
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
    WorkflowExecutionProcessor,
    WorkflowDelayProcessor,
    AdSyncMetaProcessor,
    AdSyncGoogleProcessor,
    AdSyncTikTokProcessor,
    AdInsightsAggregationProcessor,
    AnalyticsSyncProcessor,
    EmailDigestProcessor,
    AdBulkUploadProcessor,
    AdOptimizationProcessor,
    TelegramDistributeProcessor,
    AgentRunProcessor,
    AgentRunQueueService,
    PatternExtractionProcessor,
    WorkspaceTaskProcessor,
    WorkspaceTaskQueueService,
  ],
})
export class QueuesModule {}
