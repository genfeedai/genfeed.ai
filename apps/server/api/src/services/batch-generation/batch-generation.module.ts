import { BrandsModule } from '@api/collections/brands/brands.module';
import { ContentIntelligenceModule } from '@api/collections/content-intelligence/content-intelligence.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import { ConfigModule } from '@api/config/config.module';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BatchGenerationController } from '@api/services/batch-generation/batch-generation.controller';
import { BatchGenerationService } from '@api/services/batch-generation/batch-generation.service';
import {
  Batch,
  BatchSchema,
} from '@api/services/batch-generation/schemas/batch.schema';
import { LoggerModule } from '@libs/logger/logger.module';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [BatchGenerationController],
  exports: [BatchGenerationService],
  imports: [
    forwardRef(() => BrandsModule),
    ConfigModule,
    forwardRef(() => ContentIntelligenceModule),
    LoggerModule,
    forwardRef(() => PostsModule),
    MongooseModule.forFeatureAsync(
      [
        {
          name: Batch.name,
          useFactory: () => {
            const schema = BatchSchema;
            schema.plugin(mongooseAggregatePaginateV2);

            // Primary query with soft delete
            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // Status filtering
            schema.index(
              { isDeleted: 1, organization: 1, status: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // Brand filtering
            schema.index({ brand: 1, isDeleted: 1, organization: 1 });

            // User filtering
            schema.index({ isDeleted: 1, organization: 1, user: 1 });

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [BatchGenerationService],
})
export class BatchGenerationModule {}
