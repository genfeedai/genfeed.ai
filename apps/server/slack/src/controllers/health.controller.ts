import { Controller, Get } from '@nestjs/common';
import { SlackBotManager } from '@slack/services/slack-bot-manager.service';

@Controller('health')
export class HealthController {
  constructor(private readonly slackBotManager: SlackBotManager) {}

  @Get()
  getHealth() {
    return {
      activeBots: this.slackBotManager.getActiveCount(),
      service: 'slack',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
