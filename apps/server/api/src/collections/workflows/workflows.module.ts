/**
 * Workflows Module
 * Automation templates: reusable multi-step workflows, triggers (manual/auto),
dependency management, and workflow execution tracking.
 */

import { AdOptimizationAuditLogsModule } from '@api/collections/ad-optimization-audit-logs/ad-optimization-audit-logs.module';
import { AdOptimizationConfigsModule } from '@api/collections/ad-optimization-configs/ad-optimization-configs.module';
import { AdOptimizationRecommendationsModule } from '@api/collections/ad-optimization-recommendations/ad-optimization-recommendations.module';
import { AdPerformanceModule } from '@api/collections/ad-performance/ad-performance.module';
import { AgentGoalsModule } from '@api/collections/agent-goals/agent-goals.module';
import { AgentThreadsModule } from '@api/collections/agent-threads/agent-threads.module';
import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { CaptionsModule } from '@api/collections/captions/captions.module';
import { ContentPerformanceModule } from '@api/collections/content-performance/content-performance.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { MetadataModule } from '@api/collections/metadata/metadata.module';
import { MusicsModule } from '@api/collections/musics/musics.module';
import { NewslettersModule } from '@api/collections/newsletters/newsletters.module';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { OutreachCampaignsCoreModule } from '@api/collections/outreach-campaigns/outreach-campaigns-core.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import { ReplyBotConfigsModule } from '@api/collections/reply-bot-configs/reply-bot-configs.module';
import { SocialInboxModule } from '@api/collections/social-inbox/social-inbox.module';
import { SourcePostsModule } from '@api/collections/source-posts/source-posts.module';
import { TrendsModule } from '@api/collections/trends/trends.module';
import { VideoGenerationModule } from '@api/collections/videos/video-generation.module';
import { VideosModule } from '@api/collections/videos/videos.module';
import { WorkflowExecutionsModule } from '@api/collections/workflow-executions/workflow-executions.module';
import { WebhooksController } from '@api/collections/workflows/controllers/webhooks.controller';
import { WorkflowBatchController } from '@api/collections/workflows/controllers/workflow-batch.controller';
import { WorkflowBuilderController } from '@api/collections/workflows/controllers/workflow-builder.controller';
import { WorkflowCrudController } from '@api/collections/workflows/controllers/workflow-crud.controller';
import { WorkflowExecutionController } from '@api/collections/workflows/controllers/workflow-execution.controller';
import { WorkflowMarketplaceController } from '@api/collections/workflows/controllers/workflow-marketplace.controller';
import { WorkflowWebhookManagementController } from '@api/collections/workflows/controllers/workflow-webhook-management.controller';
import { WorkflowsCoreModule } from '@api/collections/workflows/workflows-core.module';
import { MarketplaceIntegrationModule } from '@api/marketplace-integration/marketplace-integration.module';
import { ContentEngineModule } from '@api/services/content-engine/content-engine.module';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { FileQueueModule } from '@api/services/files-microservice/queue/file-queue.module';
import { ElevenLabsModule } from '@api/services/integrations/elevenlabs/elevenlabs.module';
import { GoogleAdsModule } from '@api/services/integrations/google-ads/google-ads.module';
import { HeyGenModule } from '@api/services/integrations/heygen/heygen.module';
import { InstagramModule } from '@api/services/integrations/instagram/instagram.module';
import { LlmDispatcherModule } from '@api/services/integrations/llm/llm-dispatcher.module';
import { MetaAdsModule } from '@api/services/integrations/meta-ads/meta-ads.module';
import { OpenRouterModule } from '@api/services/integrations/openrouter/openrouter.module';
import { TikTokAdsModule } from '@api/services/integrations/tiktok-ads/tiktok-ads.module';
import { TwitterModule } from '@api/services/integrations/twitter/twitter.module';
import { YoutubeModule } from '@api/services/integrations/youtube/youtube.module';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { PaidCreativeResearchModule } from '@api/services/paid-creative-research/paid-creative-research.module';
import { ReplyBotModule } from '@api/services/reply-bot/reply-bot.module';
import { WhisperModule } from '@api/services/whisper/whisper.module';
import { SharedModule } from '@api/shared/shared.module';
import { HEYGEN_POLL_QUEUE } from '@genfeedai/queue-contracts';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AdAutomationWorkflowService } from '@server/collections/workflows/services/ad-automation-workflow.service';
import { InstagramSocialAdapter } from '@server/collections/workflows/services/adapters/instagram-social.adapter';
import { SocialAdapterFactory } from '@server/collections/workflows/services/adapters/social-adapter.factory';
import { TwitterSocialAdapter } from '@server/collections/workflows/services/adapters/twitter-social.adapter';
import { YoutubeSocialAdapter } from '@server/collections/workflows/services/adapters/youtube-social.adapter';
import { AgentAutopilotWorkflowService } from '@server/collections/workflows/services/agent-autopilot-workflow.service';
import { BatchWorkflowExecutionService } from '@server/collections/workflows/services/batch-workflow-execution.service';
import { ContentProductionWorkflowService } from '@server/collections/workflows/services/content-production-workflow.service';
import { LivestreamBotWorkflowService } from '@server/collections/workflows/services/livestream-bot-workflow.service';
import { OutreachCampaignDispatchWorkflowService } from '@server/collections/workflows/services/outreach-campaign-dispatch-workflow.service';
import { PaidCreativeResearchWorkflowService } from '@server/collections/workflows/services/paid-creative-research-workflow.service';
import { ReplyPollingWorkflowService } from '@server/collections/workflows/services/reply-polling-workflow.service';
import { ReviewGateNotificationService } from '@server/collections/workflows/services/review-gate-notification.service';
import { SystemWorkflowCatalogService } from '@server/collections/workflows/services/system-workflow-catalog.service';
import { SystemWorkflowDefinitionRegistrarService } from '@server/collections/workflows/services/system-workflow-definition-registrar.service';
import { TrendNotificationWorkflowService } from '@server/collections/workflows/services/trend-notification-workflow.service';
import { VideoQaContinuityResolverService } from '@server/collections/workflows/services/video-qa-continuity-resolver.service';
import { WorkflowArtifactLifecycleService } from '@server/collections/workflows/services/workflow-artifact-lifecycle.service';
import { WorkflowAutomationExecutorRegistrarService } from '@server/collections/workflows/services/workflow-automation-executor-registrar.service';
import { WorkflowContentExecutorRegistrarService } from '@server/collections/workflows/services/workflow-content-executor-registrar.service';
import { WorkflowCoreExecutorRegistrarService } from '@server/collections/workflows/services/workflow-core-executor-registrar.service';
import { WorkflowEngineAdapterService } from '@server/collections/workflows/services/workflow-engine-adapter.service';
import { WorkflowEngineExecutorHelperService } from '@server/collections/workflows/services/workflow-engine-executor-helper.service';
import { WorkflowEngineExecutorRegistryService } from '@server/collections/workflows/services/workflow-engine-executor-registry.service';
import { WorkflowExecutionAuthorizationService } from '@server/collections/workflows/services/workflow-execution-authorization.service';
import { WorkflowExecutorService } from '@server/collections/workflows/services/workflow-executor.service';
import { WorkflowFormatConverterService } from '@server/collections/workflows/services/workflow-format-converter.service';
import { WorkflowGenerationService } from '@server/collections/workflows/services/workflow-generation.service';
import { WorkflowMediaGenerationExecutorRegistrarService } from '@server/collections/workflows/services/workflow-media-generation-executor-registrar.service';
import { WorkflowMediaProcessingExecutorRegistrarService } from '@server/collections/workflows/services/workflow-media-processing-executor-registrar.service';
import { WorkflowNodeClaimService } from '@server/collections/workflows/services/workflow-node-claim.service';
import { WorkflowNodeContinuationService } from '@server/collections/workflows/services/workflow-node-continuation.service';
import { WorkflowNodeContinuationCoordinatorService } from '@server/collections/workflows/services/workflow-node-continuation-coordinator.service';
import { WorkflowRunControlService } from '@server/collections/workflows/services/workflow-run-control.service';
import { WorkflowSchedulerService } from '@server/collections/workflows/services/workflow-scheduler.service';
import { WorkflowSocialExecutorRegistrarService } from '@server/collections/workflows/services/workflow-social-executor-registrar.service';
import { WorkflowTemplateSeederService } from '@server/collections/workflows/services/workflow-template-seeder.service';
import { WorkflowTrendPublishExecutorRegistrarService } from '@server/collections/workflows/services/workflow-trend-publish-executor-registrar.service';
import { WorkflowWebhookService } from '@server/collections/workflows/services/workflow-webhook.service';
import { YoutubeLongFormWorkflowService } from '@server/collections/workflows/services/youtube-long-form-workflow.service';
import { SystemWorkflowRunnerService } from '@server/collections/workflows/system-workflow-runner.service';
import {
  SYSTEM_WORKFLOW_CATALOG,
  SYSTEM_WORKFLOW_RUNNER,
  WORKFLOW_ENGINE_ADAPTER,
  WORKFLOW_EXECUTOR,
} from '@server/collections/workflows/workflows.tokens';
import { HeygenPollQueueService } from '@server/queues/heygen-poll/heygen-poll-queue.service';

@Module({
  // Order matters: controllers that own literal first-segment routes
  // (templates, marketplace, referencable, batch, nodes/*) are registered
  // before WorkflowCrudController so its `:workflowId` param route never
  // shadows them.
  controllers: [
    WorkflowBuilderController,
    WorkflowMarketplaceController,
    WorkflowExecutionController,
    WorkflowBatchController,
    WorkflowWebhookManagementController,
    WorkflowCrudController,
    WebhooksController,
  ],
  exports: [
    BatchWorkflowExecutionService,
    SYSTEM_WORKFLOW_CATALOG,
    SYSTEM_WORKFLOW_RUNNER,
    WORKFLOW_ENGINE_ADAPTER,
    WORKFLOW_EXECUTOR,
    SystemWorkflowCatalogService,
    // The runner and its queue are re-exported through WorkflowsCoreModule,
    // which owns them; Nest rejects re-exporting another module's provider.
    WorkflowsCoreModule,
    WorkflowRunControlService,
    WorkflowSchedulerService,
    WorkflowTemplateSeederService,
    WorkflowWebhookService,
    WorkflowEngineAdapterService,
    WorkflowExecutionAuthorizationService,
    WorkflowExecutorService,
    WorkflowArtifactLifecycleService,
    WorkflowNodeContinuationCoordinatorService,
    WorkflowNodeContinuationService,
    WorkflowFormatConverterService,
    WorkflowGenerationService,
    YoutubeLongFormWorkflowService,
  ],
  imports: [
    WorkflowsCoreModule,
    AdOptimizationAuditLogsModule,
    AdOptimizationConfigsModule,
    AdOptimizationRecommendationsModule,
    AdPerformanceModule,
    AgentGoalsModule,
    AgentThreadsModule,
    BrandsCoreModule,
    CaptionsModule,
    ContentEngineModule,
    ContentPerformanceModule,
    CredentialsCoreModule,
    CreditsModule,
    ElevenLabsModule,
    FileQueueModule,
    FilesClientModule,
    GoogleAdsModule,
    HeyGenModule,
    IngredientsModule,
    InstagramModule,
    MarketplaceIntegrationModule,
    MetaAdsModule,
    MetadataModule,
    MusicsModule,
    NewslettersModule,
    NotificationsModule,
    NotificationsPublisherModule,
    OpenRouterModule,
    OrganizationSettingsModule,
    OutreachCampaignsCoreModule,
    LlmDispatcherModule,
    PostsModule,
    ReplyBotConfigsModule,
    ReplyBotModule,
    SocialInboxModule,
    SourcePostsModule,
    SharedModule,
    TrendsModule,
    HttpModule,
    TwitterModule,
    TikTokAdsModule,
    YoutubeModule,
    VideoGenerationModule,
    VideosModule,
    WhisperModule,
    WorkflowExecutionsModule,
    PaidCreativeResearchModule,

    BullModule.registerQueue({ name: HEYGEN_POLL_QUEUE }),
  ],
  providers: [
    AdAutomationWorkflowService,
    TwitterSocialAdapter,
    InstagramSocialAdapter,
    YoutubeSocialAdapter,
    SocialAdapterFactory,
    BatchWorkflowExecutionService,
    WorkflowEngineExecutorHelperService,
    WorkflowCoreExecutorRegistrarService,
    WorkflowSocialExecutorRegistrarService,
    WorkflowMediaProcessingExecutorRegistrarService,
    WorkflowMediaGenerationExecutorRegistrarService,
    WorkflowContentExecutorRegistrarService,
    WorkflowAutomationExecutorRegistrarService,
    WorkflowTrendPublishExecutorRegistrarService,
    WorkflowEngineExecutorRegistryService,
    WorkflowEngineAdapterService,
    WorkflowExecutionAuthorizationService,
    WorkflowExecutorService,
    HeygenPollQueueService,
    WorkflowArtifactLifecycleService,
    WorkflowNodeClaimService,
    WorkflowNodeContinuationCoordinatorService,
    WorkflowNodeContinuationService,
    WorkflowFormatConverterService,
    WorkflowGenerationService,
    YoutubeLongFormWorkflowService,
    ReplyPollingWorkflowService,
    // SystemWorkflowDefinitionRegistrarService registers the automation graphs in
    // this process, and the runner refuses to boot with a graph whose executors
    // are unregistered — so the services backing those actions belong here.
    AgentAutopilotWorkflowService,
    ContentProductionWorkflowService,
    TrendNotificationWorkflowService,
    LivestreamBotWorkflowService,
    OutreachCampaignDispatchWorkflowService,
    ReviewGateNotificationService,
    WorkflowRunControlService,
    WorkflowSchedulerService,
    SystemWorkflowCatalogService,
    {
      provide: SYSTEM_WORKFLOW_CATALOG,
      useExisting: SystemWorkflowCatalogService,
    },
    {
      provide: SYSTEM_WORKFLOW_RUNNER,
      useExisting: SystemWorkflowRunnerService,
    },
    {
      provide: WORKFLOW_ENGINE_ADAPTER,
      useExisting: WorkflowEngineAdapterService,
    },
    {
      provide: WORKFLOW_EXECUTOR,
      useExisting: WorkflowExecutorService,
    },
    SystemWorkflowDefinitionRegistrarService,
    WorkflowTemplateSeederService,
    WorkflowWebhookService,
    PaidCreativeResearchWorkflowService,
    VideoQaContinuityResolverService,
  ],
})
export class WorkflowsModule {}
