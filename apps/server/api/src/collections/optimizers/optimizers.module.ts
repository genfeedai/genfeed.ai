/**
 * Optimizers Module
 * AI-powered content optimization: analyze quality, score content (0-100), suggest improvements,
 * generate hashtags, create A/B variants, and recommend best posting times.
 */

import { CreditsModule } from '@api/collections/credits/credits.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { OptimizersController } from '@api/collections/optimizers/controllers/optimizers.controller';
import {
  ContentScore,
  ContentScoreSchema,
} from '@api/collections/optimizers/schemas/content-score.schema';
import {
  Optimization,
  OptimizationSchema,
} from '@api/collections/optimizers/schemas/optimization.schema';
import { OptimizersService } from '@api/collections/optimizers/services/optimizers.service';
import { ConfigModule } from '@api/config/config.module';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ByokModule } from '@api/services/byok/byok.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  controllers: [OptimizersController],
  exports: [OptimizersService],
  imports: [
    ByokModule,
    ConfigModule,
    forwardRef(() => CreditsModule),
    forwardRef(() => ModelsModule),
    ReplicateModule,
    MongooseModule.forFeatureAsync(
      [
        {
          name: ContentScore.name,
          useFactory: () => {
            const schema = ContentScoreSchema;

            // Primary query with soft delete
            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // User scores
            schema.index({ createdAt: -1, user: 1 });

            // Filter by type/platform
            schema.index({ contentType: 1, platform: 1 });

            // Sort by score
            schema.index({ overallScore: -1 });

            return schema;
          },
        },
        {
          name: Optimization.name,
          useFactory: () => {
            const schema = OptimizationSchema;

            // Primary query with soft delete
            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // User optimizations
            schema.index({ createdAt: -1, user: 1 });

            // Lookup by score
            schema.index({ score: 1 });

            // Filter by type/platform
            schema.index({ contentType: 1, platform: 1 });

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [OptimizersService, CreditsGuard, CreditsInterceptor],
})
export class OptimizersModule {}
