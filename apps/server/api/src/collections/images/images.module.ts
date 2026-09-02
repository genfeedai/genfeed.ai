/**
 * Images Module
 * AI-generated images: image generation via AI models, metadata management,
S3 storage, style/mood application, and image processing workflows.
 */
import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { AssetsModule } from '@api/collections/assets/assets.module';
import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { ImagesController } from '@api/collections/images/controllers/images.controller';
import { ImagesOperationsController } from '@api/collections/images/controllers/operations/images-operations.controller';
import { ImagesRelationshipsController } from '@api/collections/images/controllers/relationships/images-relationships.controller';
import { ImagesReframeController } from '@api/collections/images/controllers/transformations/images-reframe.controller';
import { ImagesResizeController } from '@api/collections/images/controllers/transformations/images-resize.controller';
import { ImagesUpscaleController } from '@api/collections/images/controllers/transformations/images-upscale.controller';
import { ImagesUploadsController } from '@api/collections/images/controllers/upload/images-uploads.controller';
import { ImagesCoreModule } from '@api/collections/images/images-core.module';
import { ImageGenerationService } from '@api/collections/images/services/image-generation.service';
import { ImageGenerationAdmissionService } from '@api/collections/images/services/image-generation-admission.service';
import { ImageGenerationCreditsService } from '@api/collections/images/services/image-generation-credits.service';
import { ImageGenerationProviderDispatchService } from '@api/collections/images/services/image-generation-provider-dispatch.service';
import { ImageGenerationProviderRegistryService } from '@api/collections/images/services/image-generation-provider-registry.service';
import { ImageReframeService } from '@api/collections/images/services/image-reframe.service';
import { ImageResizeService } from '@api/collections/images/services/image-resize.service';
import { ImageUpscaleService } from '@api/collections/images/services/image-upscale.service';
import { FalImageGenerationProviderAdapter } from '@api/collections/images/services/providers/fal-image-generation-provider.adapter';
import { GenfeedAiImageGenerationProviderAdapter } from '@api/collections/images/services/providers/genfeedai-image-generation-provider.adapter';
import { HiggsFieldImageGenerationProviderAdapter } from '@api/collections/images/services/providers/higgsfield-image-generation-provider.adapter';
import { KlingAiImageGenerationProviderAdapter } from '@api/collections/images/services/providers/klingai-image-generation-provider.adapter';
import { LeonardoImageGenerationProviderAdapter } from '@api/collections/images/services/providers/leonardo-image-generation-provider.adapter';
import { ReplicateImageGenerationProviderAdapter } from '@api/collections/images/services/providers/replicate-image-generation-provider.adapter';
import { SdxlImageGenerationProviderAdapter } from '@api/collections/images/services/providers/sdxl-image-generation-provider.adapter';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { MetadataModule } from '@api/collections/metadata/metadata.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { ModelRegistrationService } from '@api/collections/models/services/model-registration.service';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { PromptsModule } from '@api/collections/prompts/prompts.module';
import { TagsModule } from '@api/collections/tags/tags.module';
import { TrainingsModule } from '@api/collections/trainings/trainings.module';
import { VotesModule } from '@api/collections/votes/votes.module';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { ModelsGuard } from '@api/helpers/guards/models/models.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ByokModule } from '@api/services/byok/byok.module';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { FileQueueModule } from '@api/services/files-microservice/queue/file-queue.module';
import { ComfyUIModule } from '@api/services/integrations/comfyui/comfyui.module';
import { FalModule } from '@api/services/integrations/fal/fal.module';
import { HiggsFieldModule } from '@api/services/integrations/higgsfield/higgsfield.module';
import { HiggsFieldService } from '@api/services/integrations/higgsfield/higgsfield.service';
import { KlingAIModule } from '@api/services/integrations/klingai/klingai.module';
import { LeonardoAIModule } from '@api/services/integrations/leonardoai/leonardoai.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { SolanaModule } from '@api/services/integrations/solana/solana.module';
import { MediaVendorCostModule } from '@api/services/media-vendor-cost/media-vendor-cost.module';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { PromptBuilderModule } from '@api/services/prompt-builder/prompt-builder.module';
import { RouterModule } from '@api/services/router/router.module';
import { UploadsModule } from '@api/services/uploads/uploads.module';
import { WebhookClientModule } from '@api/services/webhook-client/webhook-client.module';
import { FailedGenerationModule } from '@api/shared/services/failed-generation/failed-generation.module';
import { IngredientCompletionModule } from '@api/shared/services/poll-until/ingredient-completion.module';
import { ConfigModule } from '@libs/config/config.module';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

@Module({
  controllers: [
    ImagesController,
    ImagesOperationsController,
    ImagesRelationshipsController,
    ImagesResizeController,
    ImagesReframeController,
    ImagesUpscaleController,
    ImagesUploadsController,
  ],
  exports: [
    ImageGenerationService,
    ImageReframeService,
    ImageUpscaleService,
    ImagesCoreModule,
  ],
  imports: [
    ImagesCoreModule,
    BrandsCoreModule,
    ByokModule,
    CreditsModule,
    HttpModule,
    IngredientsModule,
    MetadataModule,
    OrganizationSettingsModule,

    ActivitiesModule,
    AssetsModule,
    ConfigModule,
    ComfyUIModule,
    FailedGenerationModule,
    FileQueueModule,
    FilesClientModule,
    FalModule,
    HiggsFieldModule,
    KlingAIModule,
    LeonardoAIModule,
    MediaVendorCostModule,
    ModelsModule,
    NotificationsModule,
    IngredientCompletionModule,
    PromptBuilderModule,
    PromptsModule,
    ReplicateModule,
    RouterModule,
    SolanaModule,
    TagsModule,
    TrainingsModule,
    UploadsModule,
    VotesModule,
    WebhookClientModule,
  ],
  providers: [
    FalImageGenerationProviderAdapter,
    GenfeedAiImageGenerationProviderAdapter,
    {
      inject: [HiggsFieldService],
      provide: HiggsFieldImageGenerationProviderAdapter,
      useFactory: (higgsFieldService: HiggsFieldService) =>
        new HiggsFieldImageGenerationProviderAdapter(higgsFieldService),
    },
    ImageGenerationAdmissionService,
    ImageGenerationCreditsService,
    ImageGenerationProviderDispatchService,
    ImageGenerationProviderRegistryService,
    ImageGenerationService,
    ImageResizeService,
    ImageReframeService,
    ImageUpscaleService,
    KlingAiImageGenerationProviderAdapter,
    LeonardoImageGenerationProviderAdapter,
    ModelRegistrationService,
    ReplicateImageGenerationProviderAdapter,
    SdxlImageGenerationProviderAdapter,
    CreditsGuard,
    ModelsGuard,
    CreditsInterceptor,
  ],
})
export class ImagesModule {}
