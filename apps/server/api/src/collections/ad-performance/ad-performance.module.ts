import {
  AdPerformance,
  AdPerformanceSchema,
} from '@api/collections/ad-performance/schemas/ad-performance.schema';
import { AdPerformanceService } from '@api/collections/ad-performance/services/ad-performance.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  exports: [AdPerformanceService, MongooseModule],
  imports: [
    MongooseModule.forFeatureAsync(
      [
        {
          name: AdPerformance.name,
          useFactory: () => {
            const schema = AdPerformanceSchema;

            schema.index(
              {
                adPlatform: 1,
                date: -1,
                externalAccountId: 1,
                externalAdId: 1,
                externalAdSetId: 1,
                externalCampaignId: 1,
                granularity: 1,
              },
              {
                name: 'upsert_key',
                sparse: true,
                unique: true,
              },
            );

            schema.index(
              { adPlatform: 1, date: -1, organization: 1 },
              { name: 'org_platform_date' },
            );

            schema.index(
              { adPlatform: 1, date: -1, industry: 1, scope: 1 },
              { name: 'aggregation_query' },
            );

            schema.index(
              { performanceScore: -1, scope: 1 },
              { name: 'top_performers' },
            );

            schema.index(
              { date: 1 },
              {
                expireAfterSeconds: 365 * 24 * 60 * 60,
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
  providers: [AdPerformanceService],
})
export class AdPerformanceModule {}
