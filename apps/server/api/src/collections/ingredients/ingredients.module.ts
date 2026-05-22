/**
 * Ingredients Module
 * Content building blocks: manage videos, images, voices, music as reusable components.
Workflow execution, state management, and cross-content type operations.
 */

import { IngredientsController } from '@api/collections/ingredients/controllers/ingredients.controller';
import { IngredientsRelationshipsController } from '@api/collections/ingredients/controllers/ingredients-relationships.controller';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataModule } from '@api/collections/metadata/metadata.module';
import { AssetAccessGuard } from '@api/guards/asset-access.guard';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [IngredientsController, IngredientsRelationshipsController],
  exports: [IngredientsService],
  imports: [forwardRef(() => MetadataModule)],
  providers: [AssetAccessGuard, IngredientsService],
})
export class IngredientsModule {}
