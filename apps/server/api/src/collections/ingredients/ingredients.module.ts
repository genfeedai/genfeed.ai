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
import { IngredientsController } from '@api/collections/ingredients/controllers/ingredients.controller';
import { IngredientsRelationshipsController } from '@api/collections/ingredients/controllers/ingredients-relationships.controller';
import { IngredientGenerationCancellationService } from '@api/collections/ingredients/services/ingredient-generation-cancellation.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataModule } from '@api/collections/metadata/metadata.module';
import { AssetAccessGuard } from '@api/guards/asset-access.guard';
import { CleanExportAccessGuard } from '@api/helpers/guards/clean-export-access/clean-export-access.guard';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { FailedGenerationModule } from '@api/shared/services/failed-generation/failed-generation.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [
    IngredientsController,
    IngredientsRelationshipsController,
    IngredientExportsController,
  ],
  exports: [IngredientGenerationCancellationService, IngredientsService],
  imports: [
    FilesClientModule,
    MediaUrlsModule,
    FoldersModule,
    FailedGenerationModule,
    MetadataModule,
    ReplicateModule,
  ],
  providers: [
    AssetAccessGuard,
    CleanExportAccessGuard,
    IngredientExportService,
    IngredientGenerationCancellationService,
    IngredientsService,
  ],
})
export class IngredientsModule {}
