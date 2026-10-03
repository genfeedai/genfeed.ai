import { Module } from '@nestjs/common';
import { DiscordService } from '@notifications/services/discord/discord.service';
import { DiscordBotService } from '@notifications/services/discord/discord-bot.service';
import { SystemNotificationsController } from '@notifications/services/discord/system-notifications.controller';
import { ResendModule } from '@notifications/services/resend/resend.module';
import { TelegramModule } from '@notifications/services/telegram/telegram.module';
import { SharedModule } from '@notifications/shared/shared.module';

@Module({
  controllers: [SystemNotificationsController],
  exports: [DiscordBotService, DiscordService],
  imports: [SharedModule, ResendModule, TelegramModule],
  providers: [DiscordBotService, DiscordService],
})
export class DiscordModule {}
