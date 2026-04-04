/**
 * Video Transformations Module
 * Handles video transformation operations: upscale, resize, gif, lip-sync, reframe, effects, edits.
 * Split from VideosModule to reduce circular dependencies.
 */
import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { MetadataModule } from '@api/collections/metadata/metadata.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { PromptsModule } from '@api/collections/prompts/prompts.module';
import { VideosEditsController } from '@api/collections/videos/controllers/transformations/edits/videos-edits.controller';
import { VideosEffectsController } from '@api/collections/videos/controllers/transformations/effects/videos-effects.controller';
import { VideosGifController } from '@api/collections/videos/controllers/transformations/gif/videos-gif.controller';
import { VideosLipSyncController } from '@api/collections/videos/controllers/transformations/lip-sync/videos-lip-sync.controller';
import { VideosReframeController } from '@api/collections/videos/controllers/transformations/reframe/videos-reframe.controller';
import { VideosResizeController } from '@api/collections/videos/controllers/transformations/resize/videos-resize.controller';
import { VideosUpscaleController } from '@api/collections/videos/controllers/transformations/upscale/videos-upscale.controller';
import { VideosModule } from '@api/collections/videos/videos.module';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { ModelsGuard } from '@api/helpers/guards/models/models.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ByokModule } from '@api/services/byok/byok.module';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { FileQueueModule } from '@api/services/files-microservice/queue/file-queue.module';
import { HeyGenModule } from '@api/services/integrations/heygen/heygen.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { PromptBuilderModule } from '@api/services/prompt-builder/prompt-builder.module';
import { RouterModule } from '@api/services/router/router.module';
import { FailedGenerationModule } from '@api/shared/services/failed-generation/failed-generation.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [
    VideosEditsController,
    VideosEffectsController,
    VideosGifController,
    VideosLipSyncController,
    VideosReframeController,
    VideosResizeController,
    VideosUpscaleController,
  ],
  imports: [
    // Data modules
    forwardRef(() => ActivitiesModule),
    // Utility modules
    forwardRef(() => ByokModule),
    forwardRef(() => CreditsModule),
    FailedGenerationModule,
    forwardRef(() => FileQueueModule),
    // Service modules
    forwardRef(() => FilesClientModule),
    forwardRef(() => HeyGenModule),
    forwardRef(() => IngredientsModule),
    forwardRef(() => MetadataModule),
    forwardRef(() => ModelsModule),
    forwardRef(() => NotificationsPublisherModule),
    forwardRef(() => PromptBuilderModule),
    forwardRef(() => PromptsModule),
    forwardRef(() => ReplicateModule),
    forwardRef(() => RouterModule),
    // Core video module for VideosService
    forwardRef(() => VideosModule),
  ],
  providers: [CreditsGuard, CreditsInterceptor, ModelsGuard],
})
export class VideoTransformationsModule {}
