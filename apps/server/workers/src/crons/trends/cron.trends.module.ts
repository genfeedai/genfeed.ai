import {
  Trend,
  TrendSchema,
} from '@api/collections/trends/schemas/trend.schema';
import { TrendsModule } from '@api/collections/trends/trends.module';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { CacheModule } from '@api/services/cache/cache.module';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CronTrendSummaryNotificationsService } from '@workers/crons/trends/cron.trend-summary-notifications.service';
import { CronTrendsService } from '@workers/crons/trends/cron.trends.service';
import mongooseAggregatePaginate from 'mongoose-aggregate-paginate-v2';

@Module({
  imports: [
    CacheModule,
    NotificationsModule,
    TrendsModule,
    MongooseModule.forFeatureAsync(
      [
        {
          name: Trend.name,
          useFactory: () => {
            const schema = TrendSchema;
            schema.plugin(mongooseAggregatePaginate);
            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [CronTrendsService, CronTrendSummaryNotificationsService],
})
export class CronTrendsModule {}
