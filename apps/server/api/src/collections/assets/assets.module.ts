/**
 * Assets Module
 * General file management: upload/download files, S3 storage, metadata tracking,
folder organization, and asset tagging system.
 */

import { AssetsController } from '@api/collections/assets/controllers/assets.controller';
import { AssetsOperationsController } from '@api/collections/assets/controllers/operations/assets-operations.controller';
import {
  Asset,
  AssetSchema,
} from '@api/collections/assets/schemas/asset.schema';
import { AssetsService } from '@api/collections/assets/services/assets.service';
import { BrandsModule } from '@api/collections/brands/brands.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { MetadataModule } from '@api/collections/metadata/metadata.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { ConfigModule } from '@api/config/config.module';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ByokModule } from '@api/services/byok/byok.module';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { PromptBuilderModule } from '@api/services/prompt-builder/prompt-builder.module';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [AssetsController, AssetsOperationsController],
  exports: [MongooseModule, AssetsService],
  imports: [
    forwardRef(() => BrandsModule),
    ByokModule,
    forwardRef(() => CreditsModule),
    forwardRef(() => FilesClientModule),
    forwardRef(() => IngredientsModule),
    forwardRef(() => MetadataModule),
    forwardRef(() => ModelsModule),

    NotificationsPublisherModule,
    PromptBuilderModule,
    ReplicateModule,

    MongooseModule.forFeatureAsync(
      [
        {
          imports: [ConfigModule],
          inject: [ConfigService],
          name: Asset.name,
          useFactory: () => {
            const schema = AssetSchema;
            schema.plugin(mongooseAggregatePaginateV2);

            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // Type-based queries for asset categorization
            schema.index(
              { category: 1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // Parent-child relationships
            schema.index(
              { createdAt: -1, isDeleted: 1, parent: 1 },
              { partialFilterExpression: { isDeleted: false }, sparse: true },
            );
            schema.index(
              { isDeleted: 1, parent: 1, parentModel: 1 },
              { partialFilterExpression: { isDeleted: false }, sparse: true },
            );

            schema.index(
              {
                category: 1,
                parent: 1,
              },
              {
                partialFilterExpression: { parent: { $exists: true } },
                sparse: true,
              },
            );

            schema.index(
              {
                category: 1,
                isDeleted: 1,
                parent: 1,
              },
              {
                partialFilterExpression: { parent: { $exists: true } },
                sparse: true,
              },
            );

            // Additional performance indexes
            schema.index(
              { isDeleted: 1, user: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            schema.index(
              { category: 1, isDeleted: 1, user: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [AssetsService, CreditsGuard, CreditsInterceptor],
})
export class AssetsModule {}
