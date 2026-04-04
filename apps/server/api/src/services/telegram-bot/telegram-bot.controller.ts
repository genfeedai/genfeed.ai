/**
 * Telegram Bot Controller
 *
 * Webhook endpoint for production mode and status check.
 * No auth guard — webhook is verified by grammy internally via bot token.
 */

import { TelegramBotService } from '@api/services/telegram-bot/telegram-bot.service';
import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';

@Controller('telegram-bot')
export class TelegramBotController {
  constructor(private readonly telegramBotService: TelegramBotService) {}

  /**
   * Webhook endpoint for Telegram Bot API
   *
   * POST /api/telegram-bot/webhook
   */
  @Post('webhook')
  @HttpCode(200)
  async webhook(@Body() update: unknown) {
    await this.telegramBotService.handleWebhookUpdate(update);
    return { ok: true };
  }

  /**
   * Bot status check
   *
   * GET /api/telegram-bot/status
   */
  @Get('status')
  getStatus() {
    return this.telegramBotService.getStatus();
  }
}
