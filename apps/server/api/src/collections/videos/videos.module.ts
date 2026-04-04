/**
 * Videos Module (Core)
 * Core video CRUD, captions, relationships, and upload functionality.
 * Transformation and generation controllers have been split into sub-modules.
 */
import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { AssetsModule } from '@api/collections/assets/assets.module';
import { BookmarksModule } from '@api/collections/bookmarks/bookmarks.module';
import { BrandsModule } from '@api/collections/brands/brands.module';
import { CaptionsModule } from '@api/collections/captions/captions.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { MetadataModule } from '@api/collections/metadata/metadata.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { MusicsModule } from '@api/collections/musics/musics.module';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import { PromptsModule } from '@api/collections/prompts/prompts.module';
import { VideosCaptionsController } from '@api/collections/videos/controllers/captions/videos-captions.controller';
import { VideosRelationshipsController } from '@api/collections/videos/controllers/relationships/videos-relationships.controller';
import { VideosUploadController } from '@api/collections/videos/controllers/upload/videos-upload.controller';
import { VideosController } from '@api/collections/videos/controllers/videos.controller';
import { VideoMusicOrchestrationService } from '@api/collections/videos/services/video-music-orchestration.service';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { VotesModule } from '@api/collections/votes/votes.module';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { ModelsGuard } from '@api/helpers/guards/models/models.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ByokModule } from '@api/services/byok/byok.module';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { FileQueueModule } from '@api/services/files-microservice/queue/file-queue.module';
import { ElevenLabsModule } from '@api/services/integrations/elevenlabs/elevenlabs.module';
import { FalModule } from '@api/services/integrations/fal/fal.module';
import { HeyGenModule } from '@api/services/integrations/heygen/heygen.module';
import { KlingAIModule } from '@api/services/integrations/klingai/klingai.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { PromptBuilderModule } from '@api/services/prompt-builder/prompt-builder.module';
import { RouterModule } from '@api/services/router/router.module';
import { WebhookClientModule } from '@api/services/webhook-client/webhook-client.module';
import { WhisperModule } from '@api/services/whisper/whisper.module';
import { FailedGenerationModule } from '@api/shared/services/failed-generation/failed-generation.module';
import { PollingModule } from '@api/shared/services/polling/polling.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [
    VideosCaptionsController,
    // Core controllers only - transformations and generation in sub-modules
    VideosController,
    VideosRelationshipsController,
    VideosUploadController,
  ],
  exports: [VideoMusicOrchestrationService, VideosService],
  imports: [
    forwardRef(() => ActivitiesModule),
    forwardRef(() => AssetsModule),
    forwardRef(() => BookmarksModule),
    forwardRef(() => BrandsModule),
    ByokModule,
    forwardRef(() => CaptionsModule),
    forwardRef(() => CreditsModule),
    forwardRef(() => ElevenLabsModule),
    forwardRef(() => FileQueueModule),
    forwardRef(() => FilesClientModule),
    forwardRef(() => HeyGenModule),
    forwardRef(() => IngredientsModule),
    forwardRef(() => FalModule),
    forwardRef(() => KlingAIModule),
    forwardRef(() => MetadataModule),
    forwardRef(() => ModelsModule),
    forwardRef(() => MusicsModule),
    forwardRef(() => OrganizationSettingsModule),
    forwardRef(() => NotificationsPublisherModule),
    forwardRef(() => PostsModule),
    forwardRef(() => PromptBuilderModule),
    forwardRef(() => PromptsModule),
    forwardRef(() => ReplicateModule),
    forwardRef(() => RouterModule),
    forwardRef(() => VotesModule),
    forwardRef(() => WhisperModule),

    FailedGenerationModule,
    PollingModule,
    WebhookClientModule,
  ],
  providers: [
    CreditsGuard,
    CreditsInterceptor,
    ModelsGuard,
    VideoMusicOrchestrationService,
    VideosService,
  ],
})
export class VideosModule {}
