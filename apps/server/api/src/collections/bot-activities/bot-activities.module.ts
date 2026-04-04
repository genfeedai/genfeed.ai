/**
 * Bot Activities Module
 * Logs every action taken by the reply bot system.
 * Tracks successful replies, DMs sent, and skipped/failed actions.
 */
import { BotActivitiesController } from '@api/collections/bot-activities/controllers/bot-activities.controller';
import {
  BotActivity,
  BotActivitySchema,
} from '@api/collections/bot-activities/schemas/bot-activity.schema';
import { BotActivitiesService } from '@api/collections/bot-activities/services/bot-activities.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { FeatureFlagModule } from '@api/feature-flag/feature-flag.module';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [BotActivitiesController],
  exports: [BotActivitiesService, MongooseModule],
  imports: [
    FeatureFlagModule,
    MongooseModule.forFeatureAsync(
      [
        {
          name: BotActivity.name,
          useFactory: () => {
            const schema = BotActivitySchema;
            schema.plugin(mongooseAggregatePaginateV2);

            // Compound index for efficient queries
            schema.index(
              { createdAt: -1, organization: 1, replyBotConfig: 1, status: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // Index for trigger tweet deduplication checks
            schema.index(
              { organization: 1, triggerTweetId: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // Index for analytics aggregation
            schema.index({ createdAt: 1, organization: 1, status: 1 });

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [BotActivitiesService],
})
export class BotActivitiesModule {}
