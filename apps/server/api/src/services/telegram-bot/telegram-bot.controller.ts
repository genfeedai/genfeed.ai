/**
 * Telegram Bot Controller
 *
 * Webhook endpoint for production mode and status check.
 * No auth guard — the webhook is verified by the secret token Telegram echoes
 * in `X-Telegram-Bot-Api-Secret-Token` (TELEGRAM_WEBHOOK_SECRET).
 */

import { isMatchingSecret } from '@api/helpers/utils/secret-compare/secret-compare.util';
import { TelegramBotService } from '@api/services/telegram-bot/telegram-bot.service';
import { ConfigService } from '@libs/config/config.service';
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  UnauthorizedException,
} from '@nestjs/common';

@Controller('telegram-bot')
export class TelegramBotController {
  constructor(
    private readonly configService: ConfigService,
    private readonly telegramBotService: TelegramBotService,
  ) {}

  /**
   * Webhook endpoint for Telegram Bot API
   *
   * POST /api/telegram-bot/webhook
   */
  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Body() update: unknown,
    @Headers('x-telegram-bot-api-secret-token') secretToken?: string,
  ) {
    if (
      !isMatchingSecret(
        this.configService.get('TELEGRAM_WEBHOOK_SECRET'),
        secretToken,
      )
    ) {
      throw new UnauthorizedException('Invalid Telegram webhook secret');
    }

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
