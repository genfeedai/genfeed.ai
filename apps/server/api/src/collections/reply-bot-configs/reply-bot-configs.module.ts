/**
 * Reply Bot Configs Module
 * Manages reply bot configurations for auto-replying to tweets.
 * Supports two bot types:
 * - REPLY_GUY: Reply to users who reply to your tweets
 * - ACCOUNT_MONITOR: Watch specific accounts and reply when they tweet
 */
import { ReplyBotConfigsController } from '@api/collections/reply-bot-configs/controllers/reply-bot-configs.controller';
import { ReplyBotConfigsCoreModule } from '@api/collections/reply-bot-configs/reply-bot-configs-core.module';
import { FeatureFlagModule } from '@api/feature-flag/feature-flag.module';
import { QueuesModule } from '@api/queues/core/queues.module';
import { ReplyBotModule } from '@api/services/reply-bot/reply-bot.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [ReplyBotConfigsController],
  exports: [ReplyBotConfigsCoreModule],
  imports: [
    ReplyBotConfigsCoreModule,
    FeatureFlagModule,
    QueuesModule,
    ReplyBotModule,
  ],
})
export class ReplyBotConfigsModule {}
