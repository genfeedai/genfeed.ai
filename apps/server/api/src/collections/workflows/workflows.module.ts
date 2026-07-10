/**
 * Workflows Module
 * Automation templates: reusable multi-step workflows, triggers (manual/auto),
dependency management, and workflow execution tracking.
 */
import { BrandsModule } from '@api/collections/brands/brands.module';
import { CaptionsModule } from '@api/collections/captions/captions.module';
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
import { InstagramSocialAdapter } from '@api/collections/workflows/services/adapters/instagram-social.adapter';
import { SocialAdapterFactory } from '@api/collections/workflows/services/adapters/social-adapter.factory';
import { TwitterSocialAdapter } from '@api/collections/workflows/services/adapters/twitter-social.adapter';
import { YoutubeSocialAdapter } from '@api/collections/workflows/services/adapters/youtube-social.adapter';
import { BatchWorkflowService } from '@api/collections/workflows/services/batch-workflow.service';
import { BatchWorkflowQueueService } from '@api/collections/workflows/services/batch-workflow-queue.service';
import { LegacyWorkflowStepRunner } from '@api/collections/workflows/services/legacy-workflow-step-runner.service';
import { ReplyPollingWorkflowService } from '@api/collections/workflows/services/reply-polling-workflow.service';
import { WorkflowEngineAdapterService } from '@api/collections/workflows/services/workflow-engine-adapter.service';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import { WorkflowFormatConverterService } from '@api/collections/workflows/services/workflow-format-converter.service';
import { WorkflowGenerationService } from '@api/collections/workflows/services/workflow-generation.service';
import { WorkflowRunControlService } from '@api/collections/workflows/services/workflow-run-control.service';
import { WorkflowSchedulerService } from '@api/collections/workflows/services/workflow-scheduler.service';
import { WorkflowTemplateSeederService } from '@api/collections/workflows/services/workflow-template-seeder.service';
import { WorkflowWebhookService } from '@api/collections/workflows/services/workflow-webhook.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { MarketplaceIntegrationModule } from '@api/marketplace-integration/marketplace-integration.module';
import { ElevenLabsModule } from '@api/services/integrations/elevenlabs/elevenlabs.module';
import { HeyGenModule } from '@api/services/integrations/heygen/heygen.module';
import { InstagramModule } from '@api/services/integrations/instagram/instagram.module';
import { OpenRouterModule } from '@api/services/integrations/openrouter/openrouter.module';
import { TwitterModule } from '@api/services/integrations/twitter/twitter.module';
import { YoutubeModule } from '@api/services/integrations/youtube/youtube.module';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { ReplyBotModule } from '@api/services/reply-bot/reply-bot.module';
import { WhisperModule } from '@api/services/whisper/whisper.module';
import { WorkflowExecutorModule } from '@api/services/workflow-executor/workflow-executor.module';
import { SharedModule } from '@api/shared/shared.module';
import {
  BATCH_WORKFLOW_QUEUE,
  WORKFLOW_EXECUTION_QUEUE,
} from '@genfeedai/queue-contracts';
import { BullModule } from '@nestjs/bullmq';
import { forwardRef, Module } from '@nestjs/common';

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
    LegacyWorkflowStepRunner,
    WorkflowsService,
    WorkflowRunControlService,
    WorkflowSchedulerService,
    WorkflowTemplateSeederService,
    WorkflowWebhookService,
    WorkflowEngineAdapterService,
    WorkflowExecutorService,
    WorkflowExecutionQueueService,
    WorkflowFormatConverterService,
    WorkflowGenerationService,
  ],
  imports: [
    forwardRef(() => BrandsModule),
    forwardRef(() => CaptionsModule),
    forwardRef(() => CredentialsCoreModule),
    forwardRef(() => CreditsModule),
    forwardRef(() => ElevenLabsModule),
    forwardRef(() => HeyGenModule),
    forwardRef(() => IngredientsModule),
    forwardRef(() => InstagramModule),
    forwardRef(() => MarketplaceIntegrationModule),
    forwardRef(() => MetadataModule),
    forwardRef(() => MusicsModule),
    forwardRef(() => NewslettersModule),
    forwardRef(() => NotificationsModule),
    forwardRef(() => NotificationsPublisherModule),
    forwardRef(() => OpenRouterModule),
    forwardRef(() => PostsModule),
    forwardRef(() => ReplyBotConfigsModule),
    forwardRef(() => ReplyBotModule),
    forwardRef(() => SocialInboxModule),
    forwardRef(() => SourcePostsModule),
    forwardRef(() => SharedModule),
    forwardRef(() => TrendsModule),
    forwardRef(() => TwitterModule),
    forwardRef(() => YoutubeModule),
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
    YoutubeSocialAdapter,
    SocialAdapterFactory,
    BatchWorkflowQueueService,
    BatchWorkflowService,
    LegacyWorkflowStepRunner,
    WorkflowEngineAdapterService,
    WorkflowExecutorService,
    WorkflowExecutionQueueService,
    WorkflowFormatConverterService,
    WorkflowGenerationService,
    ReplyPollingWorkflowService,
    WorkflowRunControlService,
    WorkflowSchedulerService,
    WorkflowTemplateSeederService,
    WorkflowWebhookService,
    WorkflowsService,
  ],
})
export class WorkflowsModule {}
