import { EvaluationReadModule } from '@api/collections/evaluations/evaluation-read.module';
import { IngredientExportsController } from '@api/collections/ingredients/controllers/ingredient-exports.controller';
import { IngredientExportService } from '@api/collections/ingredients/services/ingredient-export.service';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { MediaUrlsModule } from '@api/services/media-urls/media-urls.module';
/**
 * Ingredients Module
 * Content building blocks: manage videos, images, voices, music as reusable components.
Workflow execution, state management, and cross-content type operations.
 */

import { FoldersModule } from '@api/collections/folders/folders.module';
import { IngredientPerceptionController } from '@api/collections/ingredients/controllers/ingredient-perception.controller';
import { IngredientsController } from '@api/collections/ingredients/controllers/ingredients.controller';
import { IngredientsRelationshipsController } from '@api/collections/ingredients/controllers/ingredients-relationships.controller';
import { IngredientsTagsController } from '@api/collections/ingredients/controllers/ingredients-tags.controller';
import { IngredientCharacterFilterService } from '@api/collections/ingredients/services/ingredient-character-filter.service';
import { IngredientGenerationCancellationService } from '@api/collections/ingredients/services/ingredient-generation-cancellation.service';
import { IngredientLineageService } from '@api/collections/ingredients/services/ingredient-lineage.service';
import { IngredientTagsService } from '@api/collections/ingredients/services/ingredient-tags.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataModule } from '@api/collections/metadata/metadata.module';
import { PersonasCoreModule } from '@api/collections/personas/personas-core.module';
import { AssetAccessGuard } from '@api/guards/asset-access.guard';
import { CleanExportAccessGuard } from '@api/helpers/guards/clean-export-access/clean-export-access.guard';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { MediaPerceptionModule } from '@api/services/media-perception/media-perception.module';
import { ModerationModule } from '@api/services/moderation/moderation.module';
import { FailedGenerationModule } from '@api/shared/services/failed-generation/failed-generation.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [
    IngredientsController,
    IngredientsRelationshipsController,
    IngredientExportsController,
    IngredientPerceptionController,
    IngredientsTagsController,
  ],
  exports: [
    IngredientCharacterFilterService,
    IngredientGenerationCancellationService,
    IngredientsService,
  ],
  imports: [
    EvaluationReadModule,
    FilesClientModule,
    MediaUrlsModule,
    FoldersModule,
    FailedGenerationModule,
    MetadataModule,
    MediaPerceptionModule,
    ModerationModule,
    PersonasCoreModule,
    ReplicateModule,
  ],
  providers: [
    AssetAccessGuard,
    CleanExportAccessGuard,
    IngredientCharacterFilterService,
    IngredientExportService,
    IngredientGenerationCancellationService,
    IngredientLineageService,
    IngredientTagsService,
    IngredientsService,
  ],
})
export class IngredientsModule {}
