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
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { FailedGenerationModule } from '@api/shared/services/failed-generation/failed-generation.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [IngredientsController, IngredientsRelationshipsController],
  exports: [IngredientGenerationCancellationService, IngredientsService],
  imports: [
    FoldersModule,
    FailedGenerationModule,
    MetadataModule,
    ReplicateModule,
  ],
  providers: [
    AssetAccessGuard,
    IngredientGenerationCancellationService,
    IngredientsService,
  ],
})
export class IngredientsModule {}
