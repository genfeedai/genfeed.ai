/**
 * Musics Module
 * AI music generation: background music creation, music track management,
mood-based music selection, and audio file storage.
 */
import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { BrandsModule } from '@api/collections/brands/brands.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { MetadataModule } from '@api/collections/metadata/metadata.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { MusicsController } from '@api/collections/musics/controllers/musics.controller';
import { MusicsOperationsController } from '@api/collections/musics/controllers/musics-operations.controller';
import { MusicsUploadController } from '@api/collections/musics/controllers/musics-upload.controller';
import { MusicsService } from '@api/collections/musics/services/musics.service';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { PromptsModule } from '@api/collections/prompts/prompts.module';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { ModelsGuard } from '@api/helpers/guards/models/models.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ByokModule } from '@api/services/byok/byok.module';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { PromptBuilderModule } from '@api/services/prompt-builder/prompt-builder.module';
import { RouterModule } from '@api/services/router/router.module';
import { FailedGenerationModule } from '@api/shared/services/failed-generation/failed-generation.module';
import { PollingModule } from '@api/shared/services/polling/polling.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [
    MusicsController,
    MusicsOperationsController,
    MusicsUploadController,
  ],
  exports: [MusicsService],
  imports: [
    forwardRef(() => ActivitiesModule),
    forwardRef(() => BrandsModule),
    ByokModule,
    forwardRef(() => CreditsModule),
    forwardRef(() => FailedGenerationModule),
    forwardRef(() => FilesClientModule),
    forwardRef(() => IngredientsModule),
    forwardRef(() => MetadataModule),
    forwardRef(() => ModelsModule),
    forwardRef(() => OrganizationSettingsModule),
    forwardRef(() => PromptBuilderModule),
    forwardRef(() => PromptsModule),
    forwardRef(() => ReplicateModule),
    forwardRef(() => RouterModule),
    PollingModule,
  ],
  providers: [MusicsService, CreditsGuard, ModelsGuard, CreditsInterceptor],
})
export class MusicsModule {}
