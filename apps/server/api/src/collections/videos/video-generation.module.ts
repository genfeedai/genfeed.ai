/**
 * Video Generation Module
 * Handles AI video generation: avatar videos (HeyGen), batch interpolation.
 * Split from VideosModule to reduce circular dependencies.
 */
import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { AssetsModule } from '@api/collections/assets/assets.module';
import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { MetadataModule } from '@api/collections/metadata/metadata.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { PromptsModule } from '@api/collections/prompts/prompts.module';
import { AvatarVideoController } from '@api/collections/videos/controllers/avatar-video.controller';
import { BatchInterpolationController } from '@api/collections/videos/controllers/batch-interpolation.controller';
import { BatchInterpolationReferenceService } from '@api/collections/videos/services/batch-interpolation-reference.service';
import { VideosCoreModule } from '@api/collections/videos/videos-core.module';
import { VoicesModule } from '@api/collections/voices/voices.module';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { ModelsGuard } from '@api/helpers/guards/models/models.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ByokModule } from '@api/services/byok/byok.module';
import { FileQueueModule } from '@api/services/files-microservice/queue/file-queue.module';
import { ElevenLabsModule } from '@api/services/integrations/elevenlabs/elevenlabs.module';
import { HeyGenModule } from '@api/services/integrations/heygen/heygen.module';
import { ManagedInferenceRuntimeModule } from '@api/services/integrations/managed-inference-runtime/managed-inference-runtime.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { PromptBuilderModule } from '@api/services/prompt-builder/prompt-builder.module';
import { FailedGenerationModule } from '@api/shared/services/failed-generation/failed-generation.module';
import { ConfigModule } from '@libs/config/config.module';
import { Module } from '@nestjs/common';
import { AvatarVideoGenerationService } from '@server/collections/videos/services/avatar-video-generation.service';

@Module({
  controllers: [AvatarVideoController, BatchInterpolationController],
  exports: [AvatarVideoGenerationService],
  imports: [
    // Core video module for VideosService
    VideosCoreModule,

    // Data modules
    ActivitiesModule,
    AssetsModule,
    BrandsCoreModule,
    ConfigModule,
    CreditsModule,
    IngredientsModule,
    MetadataModule,
    ModelsModule,
    PromptsModule,

    // Service modules
    ElevenLabsModule,
    FileQueueModule,
    ManagedInferenceRuntimeModule,
    HeyGenModule,
    NotificationsPublisherModule,
    OrganizationSettingsModule,
    PromptBuilderModule,
    ReplicateModule,
    VoicesModule,

    // Utility modules
    ByokModule,
    FailedGenerationModule,
  ],
  providers: [
    AvatarVideoGenerationService,
    BatchInterpolationReferenceService,
    CreditsGuard,
    CreditsInterceptor,
    ModelsGuard,
  ],
})
export class VideoGenerationModule {}
