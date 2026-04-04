import { DiscordBotManager } from '@discord/services/discord-bot-manager.service';
import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  constructor(private readonly discordBotManager: DiscordBotManager) {}

  @Get()
  getHealth() {
    return {
      activeBots: this.discordBotManager.getActiveCount(),
      service: 'discord',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
