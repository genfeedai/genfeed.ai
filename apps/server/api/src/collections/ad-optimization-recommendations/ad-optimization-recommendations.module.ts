import {
  AdOptimizationRecommendation,
  AdOptimizationRecommendationSchema,
} from '@api/collections/ad-optimization-recommendations/schemas/ad-optimization-recommendation.schema';
import { AdOptimizationRecommendationsService } from '@api/collections/ad-optimization-recommendations/services/ad-optimization-recommendations.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  exports: [AdOptimizationRecommendationsService, MongooseModule],
  imports: [
    MongooseModule.forFeatureAsync(
      [
        {
          name: AdOptimizationRecommendation.name,
          useFactory: () => {
            const schema = AdOptimizationRecommendationSchema;

            schema.index(
              {
                entityId: 1,
                organization: 1,
                recommendationType: 1,
                status: 1,
              },
              {
                name: 'dedup_entity_type_status',
                partialFilterExpression: { isDeleted: false },
              },
            );

            schema.index(
              { isDeleted: 1, organization: 1, status: 1 },
              {
                name: 'org_status_lookup',
                partialFilterExpression: { isDeleted: false },
              },
            );

            schema.index(
              { expiresAt: 1, status: 1 },
              {
                name: 'expire_stale',
                partialFilterExpression: {
                  isDeleted: false,
                  status: 'pending',
                },
              },
            );

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [AdOptimizationRecommendationsService],
})
export class AdOptimizationRecommendationsModule {}
