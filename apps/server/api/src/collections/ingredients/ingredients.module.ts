/**
 * Ingredients Module
 * Content building blocks: manage videos, images, voices, music as reusable components.
Workflow execution, state management, and cross-content type operations.
 */

import { IngredientsController } from '@api/collections/ingredients/controllers/ingredients.controller';
// import { IngredientsOperationsController } from '@api/collections/ingredients/controllers/ingredients-operations.controller';
import { IngredientsRelationshipsController } from '@api/collections/ingredients/controllers/ingredients-relationships.controller';
import {
  Ingredient,
  IngredientSchema,
} from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataModule } from '@api/collections/metadata/metadata.module';
import { ConfigModule } from '@api/config/config.module';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { AssetAccessGuard } from '@api/guards/asset-access.guard';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [IngredientsController, IngredientsRelationshipsController],
  exports: [MongooseModule, IngredientsService],
  imports: [
    forwardRef(() => MetadataModule),
    MongooseModule.forFeatureAsync(
      [
        {
          imports: [ConfigModule],
          inject: [ConfigService],
          name: Ingredient.name,
          useFactory: () => {
            const schema = IngredientSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            schema.virtual('votes', {
              foreignField: 'entityId',
              localField: '_id',
              ref: 'Vote',
            });

            schema.virtual('captions', {
              foreignField: 'ingredient',
              localField: '_id',
              match: { isDeleted: false },
              ref: 'Caption',
            });

            schema.virtual('posts', {
              foreignField: 'ingredient',
              localField: '_id',
              match: { isDeleted: false },
              ref: 'Post',
            });

            schema.virtual('totalVotes', {
              count: true,
              foreignField: 'entity',
              localField: '_id',
              match: { isDeleted: false },
              ref: 'Vote',
            });

            schema.virtual('children', {
              foreignField: 'parent',
              localField: '_id',
              match: { isDeleted: false },
              ref: 'Ingredient',
            });

            schema.virtual('totalChildren', {
              count: true,
              foreignField: 'parent',
              localField: '_id',
              match: { isDeleted: false },
              ref: 'Ingredient',
            });

            // Compound indexes for performance
            schema.index(
              { isDeleted: 1, user: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            schema.index(
              { isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            schema.index(
              { isDeleted: 1, status: 1, user: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            schema.index(
              { isDeleted: 1, organization: 1, status: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            schema.index(
              { category: 1, isDeleted: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            schema.index(
              { createdAt: -1, isDeleted: 1, user: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // Index for cron job: finding stuck processing ingredients
            schema.index(
              { createdAt: 1, isDeleted: 1, status: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [AssetAccessGuard, IngredientsService],
})
export class IngredientsModule {}
