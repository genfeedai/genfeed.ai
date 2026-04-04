/**
 * Reply Bot Configs Module
 * Manages reply bot configurations for auto-replying to tweets.
 * Supports two bot types:
 * - REPLY_GUY: Reply to users who reply to your tweets
 * - ACCOUNT_MONITOR: Watch specific accounts and reply when they tweet
 */
import { ReplyBotConfigsController } from '@api/collections/reply-bot-configs/controllers/reply-bot-configs.controller';
import {
  ReplyBotConfig,
  ReplyBotConfigSchema,
} from '@api/collections/reply-bot-configs/schemas/reply-bot-config.schema';
import { ReplyBotConfigsService } from '@api/collections/reply-bot-configs/services/reply-bot-configs.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { FeatureFlagModule } from '@api/feature-flag/feature-flag.module';
import { QueuesModule } from '@api/queues/core/queues.module';
import { ReplyBotModule } from '@api/services/reply-bot/reply-bot.module';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [ReplyBotConfigsController],
  exports: [ReplyBotConfigsService, MongooseModule],
  imports: [
    FeatureFlagModule,
    forwardRef(() => QueuesModule),
    forwardRef(() => ReplyBotModule),
    MongooseModule.forFeatureAsync(
      [
        {
          name: ReplyBotConfig.name,
          useFactory: () => {
            const schema = ReplyBotConfigSchema;
            schema.plugin(mongooseAggregatePaginateV2);

            // Compound index for efficient queries
            schema.index(
              { isActive: 1, isDeleted: 1, organization: 1, type: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // Index for credential lookups
            schema.index(
              { credential: 1, isActive: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [ReplyBotConfigsService],
})
export class ReplyBotConfigsModule {}
