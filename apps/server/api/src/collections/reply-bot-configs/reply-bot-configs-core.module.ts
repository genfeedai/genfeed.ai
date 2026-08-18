import { ReplyBotConfigsService } from '@api/collections/reply-bot-configs/services/reply-bot-configs.service';
import { Module } from '@nestjs/common';

/** Reply-bot config persistence only. Runtime stays on ReplyBotModule. */
@Module({
  exports: [ReplyBotConfigsService],
  providers: [ReplyBotConfigsService],
})
export class ReplyBotConfigsCoreModule {}
