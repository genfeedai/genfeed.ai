import {
  AdInsights,
  AdInsightsSchema,
} from '@api/collections/ad-insights/schemas/ad-insights.schema';
import { AdInsightsService } from '@api/collections/ad-insights/services/ad-insights.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  exports: [AdInsightsService, MongooseModule],
  imports: [
    MongooseModule.forFeatureAsync(
      [
        {
          name: AdInsights.name,
          useFactory: () => {
            const schema = AdInsightsSchema;

            schema.index(
              { adPlatform: 1, industry: 1, insightType: 1 },
              { name: 'insight_lookup' },
            );

            schema.index(
              { validUntil: 1 },
              {
                expireAfterSeconds: 0,
                name: 'ttl_cleanup',
              },
            );

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [AdInsightsService],
})
export class AdInsightsModule {}
