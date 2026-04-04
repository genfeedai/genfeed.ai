/**
 * Insights Module
 * Predictive analytics: trend forecasting, viral potential prediction, content gap analysis,
 * optimal posting times, audience growth predictions, and AI-generated actionable insights.
 */

import { CreditsModule } from '@api/collections/credits/credits.module';
import { InsightsController } from '@api/collections/insights/controllers/insights.controller';
import {
  Forecast,
  ForecastSchema,
} from '@api/collections/insights/schemas/forecast.schema';
import {
  Insight,
  InsightSchema,
} from '@api/collections/insights/schemas/insight.schema';
import { InsightsService } from '@api/collections/insights/services/insights.service';
import { ModelsModule } from '@api/collections/models/models.module';
import { ConfigModule } from '@api/config/config.module';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ByokModule } from '@api/services/byok/byok.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  controllers: [InsightsController],
  exports: [InsightsService],
  imports: [
    ByokModule,
    ConfigModule,
    forwardRef(() => CreditsModule),
    forwardRef(() => ModelsModule),
    ReplicateModule,
    MongooseModule.forFeatureAsync(
      [
        {
          name: Forecast.name,
          useFactory: () => {
            const schema = ForecastSchema;

            // Organization + Metric + Date queries
            schema.index({ createdAt: -1, metric: 1, organization: 1 });

            // Valid until expiration
            schema.index({ validUntil: 1 });

            return schema;
          },
        },
        {
          name: Insight.name,
          useFactory: () => {
            const schema = InsightSchema;

            // Primary query with soft delete and read status
            schema.index(
              {
                createdAt: -1,
                isDeleted: 1,
                isRead: 1,
                organization: 1,
              },
              { partialFilterExpression: { isDeleted: false } },
            );

            // Filter by category/impact
            schema.index({ category: 1, impact: 1 });

            // TTL index for expiration
            schema.index({ expiresAt: 1 });

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.ANALYTICS,
    ),
  ],
  providers: [InsightsService, CreditsGuard, CreditsInterceptor],
})
export class InsightsModule {}
