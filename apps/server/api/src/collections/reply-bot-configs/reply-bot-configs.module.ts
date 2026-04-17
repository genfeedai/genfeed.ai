/**
 * Reply Bot Configs Module
 * Manages reply bot configurations for auto-replying to tweets.
 * Supports two bot types:
 * - REPLY_GUY: Reply to users who reply to your tweets
 * - ACCOUNT_MONITOR: Watch specific accounts and reply when they tweet
 */
import { ReplyBotConfigsController } from '@api/collections/reply-bot-configs/controllers/reply-bot-configs.controller';
import { ReplyBotConfigsService } from '@api/collections/reply-bot-configs/services/reply-bot-configs.service';
import { FeatureFlagModule } from '@api/feature-flag/feature-flag.module';
import { QueuesModule } from '@api/queues/core/queues.module';
import { ReplyBotModule } from '@api/services/reply-bot/reply-bot.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [ReplyBotConfigsController],
  exports: [ReplyBotConfigsService],
  imports: [
    FeatureFlagModule,
    forwardRef(() => QueuesModule),
    forwardRef(() => ReplyBotModule),
  ],
  providers: [ReplyBotConfigsService],
})
export class ReplyBotConfigsModule {}
