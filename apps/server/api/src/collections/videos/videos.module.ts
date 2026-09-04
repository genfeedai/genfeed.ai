/**
 * Videos Module (Core)
 * Core video CRUD, captions, relationships, and upload functionality.
 * Transformation and generation controllers have been split into sub-modules.
 */
import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { AssetsModule } from '@api/collections/assets/assets.module';
import { BookmarksModule } from '@api/collections/bookmarks/bookmarks.module';
import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { CaptionsModule } from '@api/collections/captions/captions.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { MetadataModule } from '@api/collections/metadata/metadata.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { ModelRegistrationService } from '@api/collections/models/services/model-registration.service';
import { MusicsModule } from '@api/collections/musics/musics.module';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { PostsCoreModule } from '@api/collections/posts/posts-core.module';
import { PromptsModule } from '@api/collections/prompts/prompts.module';
import { VideosCaptionsController } from '@api/collections/videos/controllers/captions/videos-captions.controller';
import { VideosProvenanceController } from '@api/collections/videos/controllers/provenance/videos-provenance.controller';
import { VideosMergeController } from '@api/collections/videos/controllers/relationships/videos-merge.controller';
import { VideosRelationshipsController } from '@api/collections/videos/controllers/relationships/videos-relationships.controller';
import { VideosUploadController } from '@api/collections/videos/controllers/upload/videos-upload.controller';
import { VideosController } from '@api/collections/videos/controllers/videos.controller';
import { FalVideoGenerationProviderAdapter } from '@api/collections/videos/services/providers/fal-video-generation-provider.adapter';
import { HiggsFieldVideoGenerationProviderAdapter } from '@api/collections/videos/services/providers/higgsfield-video-generation-provider.adapter';
import { KlingAiVideoGenerationProviderAdapter } from '@api/collections/videos/services/providers/klingai-video-generation-provider.adapter';
import { ReplicateVideoGenerationProviderAdapter } from '@api/collections/videos/services/providers/replicate-video-generation-provider.adapter';
import { VideoGenerationService } from '@api/collections/videos/services/video-generation.service';
import { VideoGenerationCompletionService } from '@api/collections/videos/services/video-generation-completion.service';
import { VideoGenerationCreditsService } from '@api/collections/videos/services/video-generation-credits.service';
import { VideoGenerationExecutionService } from '@api/collections/videos/services/video-generation-execution.service';
import { VideoGenerationPreparationService } from '@api/collections/videos/services/video-generation-preparation.service';
import { VideoGenerationProviderDispatchService } from '@api/collections/videos/services/video-generation-provider-dispatch.service';
import { VideoMergeOrchestrationService } from '@api/collections/videos/services/video-merge-orchestration.service';
import { VideoMusicOrchestrationService } from '@api/collections/videos/services/video-music-orchestration.service';
import { VideoProvenanceService } from '@api/collections/videos/services/video-provenance.service';
import { VideosCoreModule } from '@api/collections/videos/videos-core.module';
import { VotesModule } from '@api/collections/votes/votes.module';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { ModelsGuard } from '@api/helpers/guards/models/models.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { QueuesModule } from '@api/queues/core/queues.module';
import { ByokModule } from '@api/services/byok/byok.module';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { FileQueueModule } from '@api/services/files-microservice/queue/file-queue.module';
import { ElevenLabsModule } from '@api/services/integrations/elevenlabs/elevenlabs.module';
import { FalModule } from '@api/services/integrations/fal/fal.module';
import { HeyGenModule } from '@api/services/integrations/heygen/heygen.module';
import { HiggsFieldModule } from '@api/services/integrations/higgsfield/higgsfield.module';
import { HiggsFieldService } from '@api/services/integrations/higgsfield/higgsfield.service';
import { KlingAIModule } from '@api/services/integrations/klingai/klingai.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { PromptBuilderModule } from '@api/services/prompt-builder/prompt-builder.module';
import { RouterModule } from '@api/services/router/router.module';
import { WebhookClientModule } from '@api/services/webhook-client/webhook-client.module';
import { WhisperModule } from '@api/services/whisper/whisper.module';
import { FailedGenerationModule } from '@api/shared/services/failed-generation/failed-generation.module';
import { IngredientCompletionModule } from '@api/shared/services/poll-until/ingredient-completion.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [
    VideosCaptionsController,
    VideosProvenanceController,
    // Core controllers only - transformations and generation in sub-modules
    VideosController,
    VideosRelationshipsController,
    VideosMergeController,
    VideosUploadController,
  ],
  exports: [
    VideoGenerationCreditsService,
    VideoGenerationService,
    VideoMusicOrchestrationService,
    VideoProvenanceService,
    VideosCoreModule,
  ],
  imports: [
    VideosCoreModule,
    ActivitiesModule,
    AssetsModule,
    BookmarksModule,
    BrandsCoreModule,
    ByokModule,
    CaptionsModule,
    CreditsModule,
    ElevenLabsModule,
    FailedGenerationModule,
    FalModule,
    FileQueueModule,
    FilesClientModule,
    HeyGenModule,
    HiggsFieldModule,
    IngredientsModule,
    KlingAIModule,
    MetadataModule,
    ModelsModule,
    MusicsModule,
    NotificationsPublisherModule,
    OrganizationSettingsModule,
    IngredientCompletionModule,
    PostsCoreModule,
    PromptBuilderModule,
    PromptsModule,
    QueuesModule,
    ReplicateModule,
    RouterModule,
    VotesModule,
    WebhookClientModule,
    WhisperModule,
  ],
  providers: [
    CreditsGuard,
    CreditsInterceptor,
    FalVideoGenerationProviderAdapter,
    {
      inject: [HiggsFieldService],
      provide: HiggsFieldVideoGenerationProviderAdapter,
      useFactory: (higgsFieldService: HiggsFieldService) =>
        new HiggsFieldVideoGenerationProviderAdapter(higgsFieldService),
    },
    KlingAiVideoGenerationProviderAdapter,
    ModelRegistrationService,
    ModelsGuard,
    ReplicateVideoGenerationProviderAdapter,
    VideoGenerationCompletionService,
    VideoGenerationCreditsService,
    VideoGenerationExecutionService,
    VideoGenerationPreparationService,
    VideoGenerationProviderDispatchService,
    VideoGenerationService,
    VideoMergeOrchestrationService,
    VideoMusicOrchestrationService,
    VideoProvenanceService,
  ],
})
export class VideosModule {}
