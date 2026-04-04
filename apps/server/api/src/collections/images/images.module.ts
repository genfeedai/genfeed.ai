/**
 * Images Module
 * AI-generated images: image generation via AI models, metadata management,
S3 storage, style/mood application, and image processing workflows.
 */
import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { AssetsModule } from '@api/collections/assets/assets.module';
import { BrandsModule } from '@api/collections/brands/brands.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { ImagesController } from '@api/collections/images/controllers/images.controller';
import { ImagesOperationsController } from '@api/collections/images/controllers/operations/images-operations.controller';
import { ImagesRelationshipsController } from '@api/collections/images/controllers/relationships/images-relationships.controller';
import { ImagesTransformationsController } from '@api/collections/images/controllers/transformations/images-transformations.controller';
import { ImagesUploadsController } from '@api/collections/images/controllers/upload/images-uploads.controller';
import { ImagesService } from '@api/collections/images/services/images.service';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { MetadataModule } from '@api/collections/metadata/metadata.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { PromptsModule } from '@api/collections/prompts/prompts.module';
import { TagsModule } from '@api/collections/tags/tags.module';
import { TrainingsModule } from '@api/collections/trainings/trainings.module';
import { VotesModule } from '@api/collections/votes/votes.module';
import { ConfigModule } from '@api/config/config.module';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { ModelsGuard } from '@api/helpers/guards/models/models.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ByokModule } from '@api/services/byok/byok.module';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { FileQueueModule } from '@api/services/files-microservice/queue/file-queue.module';
import { ComfyUIModule } from '@api/services/integrations/comfyui/comfyui.module';
import { FalModule } from '@api/services/integrations/fal/fal.module';
import { KlingAIModule } from '@api/services/integrations/klingai/klingai.module';
import { LeonardoAIModule } from '@api/services/integrations/leonardoai/leonardoai.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { SolanaModule } from '@api/services/integrations/solana/solana.module';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { PromptBuilderModule } from '@api/services/prompt-builder/prompt-builder.module';
import { RouterModule } from '@api/services/router/router.module';
import { UploadsModule } from '@api/services/uploads/uploads.module';
import { WebhookClientModule } from '@api/services/webhook-client/webhook-client.module';
import { FailedGenerationModule } from '@api/shared/services/failed-generation/failed-generation.module';
import { PollingModule } from '@api/shared/services/polling/polling.module';
import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [
    ImagesController,
    ImagesOperationsController,
    ImagesRelationshipsController,
    ImagesTransformationsController,
    ImagesUploadsController,
  ],
  exports: [ImagesService],
  imports: [
    forwardRef(() => BrandsModule),
    ByokModule,
    forwardRef(() => CreditsModule),
    HttpModule,
    forwardRef(() => IngredientsModule),
    forwardRef(() => MetadataModule),
    forwardRef(() => OrganizationSettingsModule),

    forwardRef(() => ActivitiesModule),
    forwardRef(() => AssetsModule),
    ConfigModule,
    ComfyUIModule,
    FailedGenerationModule,
    FileQueueModule,
    FilesClientModule,
    forwardRef(() => FalModule),
    KlingAIModule,
    LeonardoAIModule,
    forwardRef(() => ModelsModule),
    NotificationsModule,
    PollingModule,
    PromptBuilderModule,
    forwardRef(() => PromptsModule),
    ReplicateModule,
    RouterModule,
    SolanaModule,
    TagsModule,
    forwardRef(() => TrainingsModule),
    UploadsModule,
    forwardRef(() => VotesModule),
    WebhookClientModule,
  ],
  providers: [ImagesService, CreditsGuard, ModelsGuard, CreditsInterceptor],
})
export class ImagesModule {}
