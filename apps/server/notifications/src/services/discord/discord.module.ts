import { Module } from '@nestjs/common';
import { DiscordService } from '@notifications/services/discord/discord.service';
import { DiscordBotService } from '@notifications/services/discord/discord-bot.service';
import { SharedModule } from '@notifications/shared/shared.module';

@Module({
  exports: [DiscordBotService, DiscordService],
  imports: [SharedModule],
  providers: [DiscordBotService, DiscordService],
})
export class DiscordModule {}
