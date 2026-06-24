/**
 * Workflows Module
 * Automation templates: reusable multi-step workflows, triggers (manual/auto),
dependency management, and workflow execution tracking.
 */
import { AdOptimizationConfigsModule } from '@api/collections/ad-optimization-configs/ad-optimization-configs.module';
import { AdPerformanceModule } from '@api/collections/ad-performance/ad-performance.module';
import { AgentGoalsModule } from '@api/collections/agent-goals/agent-goals.module';
import { AgentRunsModule } from '@api/collections/agent-runs/agent-runs.module';
import { BrandsModule } from '@api/collections/brands/brands.module';
import { CaptionsModule } from '@api/collections/captions/captions.module';
import { ContentSchedulesModule } from '@api/collections/content-schedules/content-schedules.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { CronJobsModule } from '@api/collections/cron-jobs/cron-jobs.module';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { MetadataModule } from '@api/collections/metadata/metadata.module';
import { MusicsModule } from '@api/collections/musics/musics.module';
import { NewslettersModule } from '@api/collections/newsletters/newsletters.module';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import { ReplyBotConfigsModule } from '@api/collections/reply-bot-configs/reply-bot-configs.module';
import { TrendsModule } from '@api/collections/trends/trends.module';
import { VideoGenerationModule } from '@api/collections/videos/video-generation.module';
import { VideosModule } from '@api/collections/videos/videos.module';
import { WorkflowExecutionsModule } from '@api/collections/workflow-executions/workflow-executions.module';
import { WebhooksController } from '@api/collections/workflows/controllers/webhooks.controller';
import { WorkflowsController } from '@api/collections/workflows/controllers/workflows.controller';
import { AdAutomationWorkflowService } from '@api/collections/workflows/services/ad-automation-workflow.service';
import { InstagramSocialAdapter } from '@api/collections/workflows/services/adapters/instagram-social.adapter';
import { SocialAdapterFactory } from '@api/collections/workflows/services/adapters/social-adapter.factory';
import { TwitterSocialAdapter } from '@api/collections/workflows/services/adapters/twitter-social.adapter';
import { AgentAutopilotWorkflowService } from '@api/collections/workflows/services/agent-autopilot-workflow.service';
import { AnalyticsSyncWorkflowService } from '@api/collections/workflows/services/analytics-sync-workflow.service';
import { BatchWorkflowService } from '@api/collections/workflows/services/batch-workflow.service';
import {
  BATCH_WORKFLOW_QUEUE,
  BatchWorkflowQueueService,
} from '@api/collections/workflows/services/batch-workflow-queue.service';
import { CampaignOrchestrationWorkflowService } from '@api/collections/workflows/services/campaign-orchestration-workflow.service';
import { ContentProductionWorkflowService } from '@api/collections/workflows/services/content-production-workflow.service';
import { ReplyPollingWorkflowService } from '@api/collections/workflows/services/reply-polling-workflow.service';
import { TrendNotificationWorkflowService } from '@api/collections/workflows/services/trend-notification-workflow.service';
import { WorkflowEngineAdapterService } from '@api/collections/workflows/services/workflow-engine-adapter.service';
import {
  WORKFLOW_EXECUTION_QUEUE,
  WorkflowExecutionQueueService,
} from '@api/collections/workflows/services/workflow-execution-queue.service';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import { WorkflowFormatConverterService } from '@api/collections/workflows/services/workflow-format-converter.service';
import { WorkflowGenerationService } from '@api/collections/workflows/services/workflow-generation.service';
import { WorkflowSchedulerService } from '@api/collections/workflows/services/workflow-scheduler.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { MarketplaceIntegrationModule } from '@api/marketplace-integration/marketplace-integration.module';
import { QueuesModule } from '@api/queues/core/queues.module';
import { AgentCampaignOrchestratorModule } from '@api/services/agent-campaign/agent-campaign-orchestrator.module';
import { AiInfluencerModule } from '@api/services/ai-influencer/ai-influencer.module';
import { ContentEngineModule } from '@api/services/content-engine/content-engine.module';
import { ContentGatewayModule } from '@api/services/content-gateway/content-gateway.module';
import { ContentOrchestrationModule } from '@api/services/content-orchestration/content-orchestration.module';
import { ElevenLabsModule } from '@api/services/integrations/elevenlabs/elevenlabs.module';
import { GoogleAdsModule } from '@api/services/integrations/google-ads/google-ads.module';
import { HeyGenModule } from '@api/services/integrations/heygen/heygen.module';
import { InstagramModule } from '@api/services/integrations/instagram/instagram.module';
import { MetaAdsModule } from '@api/services/integrations/meta-ads/meta-ads.module';
import { OpenRouterModule } from '@api/services/integrations/openrouter/openrouter.module';
import { TikTokAdsModule } from '@api/services/integrations/tiktok-ads/tiktok-ads.module';
import { TwitterModule } from '@api/services/integrations/twitter/twitter.module';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { ReplyBotModule } from '@api/services/reply-bot/reply-bot.module';
import { WhisperModule } from '@api/services/whisper/whisper.module';
import { WorkflowExecutorModule } from '@api/services/workflow-executor/workflow-executor.module';
import { SharedModule } from '@api/shared/shared.module';
import { BullModule } from '@nestjs/bullmq';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [WorkflowsController, WebhooksController],
  exports: [
    BatchWorkflowQueueService,
    BatchWorkflowService,
    WorkflowsService,
    WorkflowSchedulerService,
    WorkflowEngineAdapterService,
    WorkflowExecutorService,
    WorkflowExecutionQueueService,
    WorkflowFormatConverterService,
    WorkflowGenerationService,
    AdAutomationWorkflowService,
    AgentAutopilotWorkflowService,
    AnalyticsSyncWorkflowService,
    CampaignOrchestrationWorkflowService,
    ContentProductionWorkflowService,
    ReplyPollingWorkflowService,
    TrendNotificationWorkflowService,
  ],
  imports: [
    forwardRef(() => AdOptimizationConfigsModule),
    forwardRef(() => AdPerformanceModule),
    forwardRef(() => AgentCampaignOrchestratorModule),
    forwardRef(() => AgentGoalsModule),
    forwardRef(() => AgentRunsModule),
    forwardRef(() => AiInfluencerModule),
    forwardRef(() => BrandsModule),
    forwardRef(() => CaptionsModule),
    forwardRef(() => ContentEngineModule),
    forwardRef(() => ContentGatewayModule),
    forwardRef(() => ContentOrchestrationModule),
    forwardRef(() => ContentSchedulesModule),
    forwardRef(() => CredentialsCoreModule),
    forwardRef(() => CronJobsModule),
    forwardRef(() => CreditsModule),
    forwardRef(() => ElevenLabsModule),
    forwardRef(() => GoogleAdsModule),
    forwardRef(() => HeyGenModule),
    forwardRef(() => IngredientsModule),
    forwardRef(() => InstagramModule),
    forwardRef(() => MarketplaceIntegrationModule),
    forwardRef(() => MetadataModule),
    forwardRef(() => MetaAdsModule),
    forwardRef(() => MusicsModule),
    forwardRef(() => NewslettersModule),
    forwardRef(() => NotificationsModule),
    forwardRef(() => NotificationsPublisherModule),
    forwardRef(() => OrganizationSettingsModule),
    forwardRef(() => OpenRouterModule),
    forwardRef(() => PostsModule),
    forwardRef(() => QueuesModule),
    forwardRef(() => ReplyBotConfigsModule),
    forwardRef(() => ReplyBotModule),
    forwardRef(() => SharedModule),
    forwardRef(() => TikTokAdsModule),
    forwardRef(() => TrendsModule),
    forwardRef(() => TwitterModule),
    forwardRef(() => VideoGenerationModule),
    forwardRef(() => VideosModule),
    forwardRef(() => WhisperModule),
    forwardRef(() => WorkflowExecutionsModule),
    forwardRef(() => WorkflowExecutorModule),

    BullModule.registerQueue({
      defaultJobOptions: {
        attempts: 3,
        backoff: { delay: 5000, type: 'exponential' },
        removeOnComplete: 200,
        removeOnFail: 100,
      },
      name: WORKFLOW_EXECUTION_QUEUE,
    }),

    BullModule.registerQueue({
      defaultJobOptions: {
        attempts: 2,
        backoff: { delay: 5000, type: 'exponential' },
        removeOnComplete: 200,
        removeOnFail: 100,
      },
      name: BATCH_WORKFLOW_QUEUE,
    }),
  ],
  providers: [
    TwitterSocialAdapter,
    InstagramSocialAdapter,
    SocialAdapterFactory,
    AdAutomationWorkflowService,
    AgentAutopilotWorkflowService,
    AnalyticsSyncWorkflowService,
    BatchWorkflowQueueService,
    BatchWorkflowService,
    CampaignOrchestrationWorkflowService,
    ContentProductionWorkflowService,
    ReplyPollingWorkflowService,
    TrendNotificationWorkflowService,
    WorkflowEngineAdapterService,
    WorkflowExecutorService,
    WorkflowExecutionQueueService,
    WorkflowFormatConverterService,
    WorkflowGenerationService,
    WorkflowSchedulerService,
    WorkflowsService,
  ],
})
export class WorkflowsModule {}
