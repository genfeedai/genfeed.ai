/**
 * Workflows Module
 * Automation templates: reusable multi-step workflows, triggers (manual/auto),
dependency management, and workflow execution tracking.
 */

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
import { FileQueueModule } from '@api/services/files-microservice/queue/file-queue.module';
import { ElevenLabsModule } from '@api/services/integrations/elevenlabs/elevenlabs.module';
import { HeyGenModule } from '@api/services/integrations/heygen/heygen.module';
import { InstagramModule } from '@api/services/integrations/instagram/instagram.module';
import { OpenRouterModule } from '@api/services/integrations/openrouter/openrouter.module';
import { TwitterModule } from '@api/services/integrations/twitter/twitter.module';
import { YoutubeModule } from '@api/services/integrations/youtube/youtube.module';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { PaidCreativeResearchModule } from '@api/services/paid-creative-research/paid-creative-research.module';
import { ReplyBotModule } from '@api/services/reply-bot/reply-bot.module';
import { WhisperModule } from '@api/services/whisper/whisper.module';
import { WorkflowExecutorModule } from '@api/services/workflow-executor/workflow-executor.module';
import { SharedModule } from '@api/shared/shared.module';
import {
  BATCH_WORKFLOW_QUEUE,
  WORKFLOW_EXECUTION_QUEUE,
} from '@genfeedai/queue-contracts';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bullmq';
import { forwardRef, Module } from '@nestjs/common';
import { InstagramSocialAdapter } from '@server/collections/workflows/services/adapters/instagram-social.adapter';
import { SocialAdapterFactory } from '@server/collections/workflows/services/adapters/social-adapter.factory';
import { TwitterSocialAdapter } from '@server/collections/workflows/services/adapters/twitter-social.adapter';
import { YoutubeSocialAdapter } from '@server/collections/workflows/services/adapters/youtube-social.adapter';
import { BatchWorkflowService } from '@server/collections/workflows/services/batch-workflow.service';
import { BatchWorkflowQueueService } from '@server/collections/workflows/services/batch-workflow-queue.service';
import { LivestreamBotWorkflowService } from '@server/collections/workflows/services/livestream-bot-workflow.service';
import { OutreachCampaignDispatchWorkflowService } from '@server/collections/workflows/services/outreach-campaign-dispatch-workflow.service';
import { PaidCreativeResearchWorkflowService } from '@server/collections/workflows/services/paid-creative-research-workflow.service';
import { ReplyPollingWorkflowService } from '@server/collections/workflows/services/reply-polling-workflow.service';
import { ReviewGateNotificationService } from '@server/collections/workflows/services/review-gate-notification.service';
import { SystemWorkflowCatalogService } from '@server/collections/workflows/services/system-workflow-catalog.service';
import { WorkflowEngineAdapterService } from '@server/collections/workflows/services/workflow-engine-adapter.service';
import { WorkflowExecutionAuthorizationService } from '@server/collections/workflows/services/workflow-execution-authorization.service';
import { WorkflowExecutionQueueService } from '@server/collections/workflows/services/workflow-execution-queue.service';
import { WorkflowExecutorService } from '@server/collections/workflows/services/workflow-executor.service';
import { WorkflowFormatConverterService } from '@server/collections/workflows/services/workflow-format-converter.service';
import { WorkflowGenerationService } from '@server/collections/workflows/services/workflow-generation.service';
import { WorkflowRunControlService } from '@server/collections/workflows/services/workflow-run-control.service';
import { WorkflowSchedulerService } from '@server/collections/workflows/services/workflow-scheduler.service';
import { WorkflowTemplateSeederService } from '@server/collections/workflows/services/workflow-template-seeder.service';
import { WorkflowWebhookService } from '@server/collections/workflows/services/workflow-webhook.service';
import { YoutubeLongFormWorkflowService } from '@server/collections/workflows/services/youtube-long-form-workflow.service';
import { SystemWorkflowRunnerService } from '@server/collections/workflows/system-workflow-runner.service';

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
    BatchWorkflowQueueService,
    BatchWorkflowService,
    SystemWorkflowCatalogService,
    SystemWorkflowRunnerService,
    WorkflowsCoreModule,
    WorkflowRunControlService,
    WorkflowSchedulerService,
    WorkflowTemplateSeederService,
    WorkflowWebhookService,
    WorkflowEngineAdapterService,
    WorkflowExecutionAuthorizationService,
    WorkflowExecutorService,
    WorkflowExecutionQueueService,
    WorkflowFormatConverterService,
    WorkflowGenerationService,
    YoutubeLongFormWorkflowService,
  ],
  imports: [
    WorkflowsCoreModule,
    AgentThreadsModule,
    BrandsCoreModule,
    CaptionsModule,
    ContentPerformanceModule,
    CredentialsCoreModule,
    CreditsModule,
    ElevenLabsModule,
    FileQueueModule,
    HeyGenModule,
    IngredientsModule,
    InstagramModule,
    MarketplaceIntegrationModule,
    MetadataModule,
    MusicsModule,
    NewslettersModule,
    NotificationsModule,
    NotificationsPublisherModule,
    OpenRouterModule,
    PostsModule,
    ReplyBotConfigsModule,
    forwardRef(() => ReplyBotModule),
    forwardRef(() => SocialInboxModule),
    SourcePostsModule,
    SharedModule,
    TrendsModule,
    HttpModule,
    TwitterModule,
    YoutubeModule,
    VideoGenerationModule,
    VideosModule,
    WhisperModule,
    WorkflowExecutionsModule,
    WorkflowExecutorModule,
    PaidCreativeResearchModule,

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
    YoutubeSocialAdapter,
    SocialAdapterFactory,
    BatchWorkflowQueueService,
    BatchWorkflowService,
    WorkflowEngineAdapterService,
    WorkflowExecutionAuthorizationService,
    WorkflowExecutorService,
    WorkflowExecutionQueueService,
    WorkflowFormatConverterService,
    WorkflowGenerationService,
    YoutubeLongFormWorkflowService,
    ReplyPollingWorkflowService,
    LivestreamBotWorkflowService,
    OutreachCampaignDispatchWorkflowService,
    ReviewGateNotificationService,
    WorkflowRunControlService,
    WorkflowSchedulerService,
    SystemWorkflowCatalogService,
    SystemWorkflowRunnerService,
    WorkflowTemplateSeederService,
    WorkflowWebhookService,
    PaidCreativeResearchWorkflowService,
  ],
})
export class WorkflowsModule {}
