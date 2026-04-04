import { Controller, Get } from '@nestjs/common';
import { TelegramBotManager } from '@telegram/services/telegram-bot-manager.service';

@Controller('health')
export class HealthController {
  constructor(private readonly telegramBotManager: TelegramBotManager) {}

  @Get()
  getHealth() {
    const activeCount = this.telegramBotManager.getActiveCount();

    return {
      activeBots: activeCount,
      service: 'telegram',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
