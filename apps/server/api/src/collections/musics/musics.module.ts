/**
 * Musics Module
 * AI music generation: background music creation, music track management,
mood-based music selection, and audio file storage.
 */
import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { MetadataModule } from '@api/collections/metadata/metadata.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { MusicsController } from '@api/collections/musics/controllers/musics.controller';
import { MusicsOperationsController } from '@api/collections/musics/controllers/musics-operations.controller';
import { MusicsUploadController } from '@api/collections/musics/controllers/musics-upload.controller';
import { MusicGenerationService } from '@api/collections/musics/services/music-generation.service';
import { MusicGenerationCreditsService } from '@api/collections/musics/services/music-generation-credits.service';
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
import { IngredientCompletionModule } from '@api/shared/services/poll-until/ingredient-completion.module';
import { Module } from '@nestjs/common';
import { MusicsService } from '@server/collections/musics/services/musics.service';

@Module({
  controllers: [
    MusicsController,
    MusicsOperationsController,
    MusicsUploadController,
  ],
  exports: [MusicsService],
  imports: [
    ActivitiesModule,
    BrandsCoreModule,
    ByokModule,
    CreditsModule,
    FailedGenerationModule,
    FilesClientModule,
    IngredientsModule,
    MetadataModule,
    ModelsModule,
    OrganizationSettingsModule,
    PromptBuilderModule,
    PromptsModule,
    ReplicateModule,
    RouterModule,
    IngredientCompletionModule,
  ],
  providers: [
    MusicsService,
    MusicGenerationCreditsService,
    MusicGenerationService,
    CreditsGuard,
    ModelsGuard,
    CreditsInterceptor,
  ],
})
export class MusicsModule {}
