import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import {
  returnBadRequest,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { createApiKeyConnectException } from '@api/services/integrations/_shared/api-key-connect-error.util';
import {
  TelegramApiError,
  TelegramBotApiService,
} from '@api/services/integrations/telegram/services/telegram-bot-api.service';
import {
  ApiKeyConnectErrorCode,
  CredentialPlatform,
} from '@genfeedai/contracts';
import { CredentialSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

/** The shape BotFather issues: `<bot id>:<secret>`. */
const BOT_TOKEN_PATTERN = /^\d+:[A-Za-z0-9_-]+$/;

/**
 * Connect a Telegram bot as a publishing account of a brand. The bot token is
 * the credential; the chat it posts to is chosen per post (`chatId` setting).
 */
@AutoSwagger()
@Controller('services/telegram')
export class TelegramBotConnectController {
  constructor(
    private readonly telegramBotApi: TelegramBotApiService,
    private readonly brandsService: BrandsService,
    private readonly credentialsService: CredentialsService,
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * POST /services/telegram/connect
   */
  @Post('connect')
  async connect(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() body: { botToken: string; brandId: string },
  ) {
    if (
      typeof body.botToken !== 'string' ||
      !body.botToken.trim() ||
      !body.brandId
    ) {
      return returnBadRequest({
        detail: 'Bot token and brand ID are required',
        title: 'Invalid payload',
      });
    }

    const brand = await this.brandsService.findOne({
      id: body.brandId,
      organizationId: user.organizationId,
    });

    if (!brand) {
      return returnBadRequest({
        detail: 'You do not have access to this brand',
        title: 'Invalid payload',
      });
    }

    const botToken = body.botToken.trim();
    if (!BOT_TOKEN_PATTERN.test(botToken)) {
      throw createApiKeyConnectException(
        ApiKeyConnectErrorCode.INVALID_KEY_FORMAT,
      );
    }

    let bot: Awaited<ReturnType<TelegramBotApiService['getMe']>>;
    try {
      bot = await this.telegramBotApi.getMe(botToken);
    } catch (error: unknown) {
      const isRefused =
        error instanceof TelegramApiError && error.kind === 'token_invalid';
      this.loggerService.warn('Telegram bot connect refused', {
        kind: error instanceof TelegramApiError ? error.kind : 'unknown',
      });
      throw createApiKeyConnectException(
        isRefused
          ? ApiKeyConnectErrorCode.KEY_REJECTED
          : ApiKeyConnectErrorCode.UNKNOWN,
      );
    }

    const pending = await this.credentialsService.createPendingForBrand(
      brand,
      user.userId ?? user.id,
      CredentialPlatform.TELEGRAM,
      { accessToken: botToken },
    );

    // Identity is the bot, so a brand can hold several bots and reconnecting
    // the same bot refreshes its row instead of adding one.
    const credential = await this.credentialsService.updateExternalProfile(
      pending.id,
      brand.organizationId,
      {
        handle: bot.username,
        id: String(bot.id),
        name: bot.username ?? String(bot.id),
      },
    );

    return serializeSingle(request, CredentialSerializer, credential);
  }
}
