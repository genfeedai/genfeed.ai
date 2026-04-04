import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { ReplyBotConfigsModule } from '@api/collections/reply-bot-configs/reply-bot-configs.module';
import { ReplyBotModule } from '@api/services/reply-bot/reply-bot.module';
import { Module } from '@nestjs/common';
import { CronReplyBotService } from '@workers/crons/reply-bot/cron.reply-bot.service';

@Module({
  exports: [CronReplyBotService],
  imports: [CredentialsModule, ReplyBotConfigsModule, ReplyBotModule],
  providers: [CronReplyBotService],
})
export class CronReplyBotModule {}
