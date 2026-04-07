/**
 * Workflows Module
 * Automation templates: reusable multi-step workflows, triggers (manual/auto),
dependency management, and workflow execution tracking.
 */
import { BrandsModule } from '@api/collections/brands/brands.module';
import { CaptionsModule } from '@api/collections/captions/captions.module';
import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { MetadataModule } from '@api/collections/metadata/metadata.module';
import { MusicsModule } from '@api/collections/musics/musics.module';
import { NewslettersModule } from '@api/collections/newsletters/newsletters.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import { VideoGenerationModule } from '@api/collections/videos/video-generation.module';
import { VideosModule } from '@api/collections/videos/videos.module';
import { WorkflowExecutionsModule } from '@api/collections/workflow-executions/workflow-executions.module';
import { WebhooksController } from '@api/collections/workflows/controllers/webhooks.controller';
import { WorkflowsController } from '@api/collections/workflows/controllers/workflows.controller';
import {
  BatchWorkflowJob,
  BatchWorkflowJobSchema,
} from '@api/collections/workflows/schemas/batch-workflow-job.schema';
import {
  Workflow,
  WorkflowSchema,
} from '@api/collections/workflows/schemas/workflow.schema';
import { InstagramSocialAdapter } from '@api/collections/workflows/services/adapters/instagram-social.adapter';
import { SocialAdapterFactory } from '@api/collections/workflows/services/adapters/social-adapter.factory';
import { TwitterSocialAdapter } from '@api/collections/workflows/services/adapters/twitter-social.adapter';
import { BatchWorkflowService } from '@api/collections/workflows/services/batch-workflow.service';
import {
  BATCH_WORKFLOW_QUEUE,
  BatchWorkflowQueueService,
} from '@api/collections/workflows/services/batch-workflow-queue.service';
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
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { MarketplaceIntegrationModule } from '@api/marketplace-integration/marketplace-integration.module';
import { ElevenLabsModule } from '@api/services/integrations/elevenlabs/elevenlabs.module';
import { HeyGenModule } from '@api/services/integrations/heygen/heygen.module';
import { InstagramModule } from '@api/services/integrations/instagram/instagram.module';
import { OpenRouterModule } from '@api/services/integrations/openrouter/openrouter.module';
import { TwitterModule } from '@api/services/integrations/twitter/twitter.module';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { WhisperModule } from '@api/services/whisper/whisper.module';
import { WorkflowExecutorModule } from '@api/services/workflow-executor/workflow-executor.module';
import { SharedModule } from '@api/shared/shared.module';
import { BullModule } from '@nestjs/bullmq';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [WorkflowsController, WebhooksController],
  exports: [
    MongooseModule,
    WorkflowsService,
    WorkflowSchedulerService,
    WorkflowEngineAdapterService,
    WorkflowExecutorService,
    WorkflowExecutionQueueService,
    WorkflowGenerationService,
  ],
  imports: [
    forwardRef(() => BrandsModule),
    forwardRef(() => CaptionsModule),
    forwardRef(() => CredentialsModule),
    forwardRef(() => CreditsModule),
    forwardRef(() => IngredientsModule),
    forwardRef(() => MetadataModule),
    forwardRef(() => MusicsModule),
    forwardRef(() => NewslettersModule),
    forwardRef(() => MarketplaceIntegrationModule),
    forwardRef(() => NotificationsPublisherModule),
    forwardRef(() => PostsModule),
    forwardRef(() => SharedModule),
    forwardRef(() => VideosModule),
    forwardRef(() => VideoGenerationModule),
    forwardRef(() => WorkflowExecutionsModule),
    forwardRef(() => TwitterModule),
    forwardRef(() => InstagramModule),
    forwardRef(() => OpenRouterModule),
    forwardRef(() => HeyGenModule),
    forwardRef(() => ElevenLabsModule),
    forwardRef(() => WhisperModule),
    WorkflowExecutorModule,

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

    MongooseModule.forFeature(
      [{ name: BatchWorkflowJob.name, schema: BatchWorkflowJobSchema }],
      DB_CONNECTIONS.CLOUD,
    ),

    MongooseModule.forFeatureAsync(
      [
        {
          name: Workflow.name,
          useFactory: () => {
            const schema = WorkflowSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // Status-based workflow queries (with soft-delete awareness)
            schema.index(
              { isDeleted: 1, organization: 1, status: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );
            schema.index(
              { isDeleted: 1, status: 1, user: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );
            schema.index({ status: 1, trigger: 1 });

            // Marketplace queries (public templates)
            schema.index(
              { isDeleted: 1, isPublic: 1, isTemplate: 1 },
              { partialFilterExpression: { isDeleted: false, isPublic: true } },
            );

            // Template lookup by key
            schema.index({ isDeleted: 1, isTemplate: 1, templateId: 1 });

            // Published workflow trigger matching
            schema.index(
              { isDeleted: 1, lifecycle: 1, organization: 1 },
              {
                partialFilterExpression: {
                  isDeleted: false,
                  lifecycle: 'published',
                },
              },
            );

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [
    TwitterSocialAdapter,
    InstagramSocialAdapter,
    SocialAdapterFactory,
    // BatchWorkflowProcessor + WorkflowExecutionProcessor moved to workers (issue #84)
    BatchWorkflowQueueService,
    BatchWorkflowService,
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
