/**
 * Video Generation Module
 * Handles AI video generation: avatar videos (HeyGen), batch interpolation.
 * Split from VideosModule to reduce circular dependencies.
 */
import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { AssetsModule } from '@api/collections/assets/assets.module';
import { BrandsModule } from '@api/collections/brands/brands.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { MetadataModule } from '@api/collections/metadata/metadata.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { PromptsModule } from '@api/collections/prompts/prompts.module';
import { AvatarVideoController } from '@api/collections/videos/controllers/avatar-video.controller';
import { BatchInterpolationController } from '@api/collections/videos/controllers/batch-interpolation.controller';
import { AvatarVideoGenerationService } from '@api/collections/videos/services/avatar-video-generation.service';
import { VideosModule } from '@api/collections/videos/videos.module';
import { VoicesModule } from '@api/collections/voices/voices.module';
import { ConfigModule } from '@api/config/config.module';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { ModelsGuard } from '@api/helpers/guards/models/models.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ByokModule } from '@api/services/byok/byok.module';
import { FileQueueModule } from '@api/services/files-microservice/queue/file-queue.module';
import { ElevenLabsModule } from '@api/services/integrations/elevenlabs/elevenlabs.module';
import { FleetModule } from '@api/services/integrations/fleet/fleet.module';
import { HeyGenModule } from '@api/services/integrations/heygen/heygen.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { PromptBuilderModule } from '@api/services/prompt-builder/prompt-builder.module';
import { FailedGenerationModule } from '@api/shared/services/failed-generation/failed-generation.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [AvatarVideoController, BatchInterpolationController],
  exports: [AvatarVideoGenerationService],
  imports: [
    // Core video module for VideosService
    forwardRef(() => VideosModule),

    // Data modules
    forwardRef(() => ActivitiesModule),
    forwardRef(() => AssetsModule),
    forwardRef(() => BrandsModule),
    forwardRef(() => ConfigModule),
    forwardRef(() => CreditsModule),
    forwardRef(() => IngredientsModule),
    forwardRef(() => MetadataModule),
    forwardRef(() => ModelsModule),
    forwardRef(() => PromptsModule),

    // Service modules
    forwardRef(() => ElevenLabsModule),
    forwardRef(() => FileQueueModule),
    forwardRef(() => FleetModule),
    forwardRef(() => HeyGenModule),
    forwardRef(() => NotificationsPublisherModule),
    forwardRef(() => OrganizationSettingsModule),
    forwardRef(() => PromptBuilderModule),
    forwardRef(() => ReplicateModule),
    forwardRef(() => VoicesModule),

    // Utility modules
    forwardRef(() => ByokModule),
    FailedGenerationModule,
  ],
  providers: [
    AvatarVideoGenerationService,
    CreditsGuard,
    CreditsInterceptor,
    ModelsGuard,
  ],
})
export class VideoGenerationModule {}
