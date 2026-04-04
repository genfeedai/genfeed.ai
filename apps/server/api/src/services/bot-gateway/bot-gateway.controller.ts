import { ConfigService } from '@api/config/config.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { DiscordBotAdapter } from '@api/services/bot-gateway/adapters/discord-bot.adapter';
import { SlackBotAdapter } from '@api/services/bot-gateway/adapters/slack-bot.adapter';
import { TelegramBotAdapter } from '@api/services/bot-gateway/adapters/telegram-bot.adapter';
import { BotGatewayService } from '@api/services/bot-gateway/bot-gateway.service';
import {
  BotInteractionType,
  BotResponseType,
  CredentialPlatform,
} from '@genfeedai/enums';
import { Public } from '@libs/decorators/public.decorator';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  type RawBodyRequest,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Public()
@Controller('webhooks/bot')
export class BotGatewayController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    readonly _configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly botGatewayService: BotGatewayService,
    private readonly discordAdapter: DiscordBotAdapter,
    private readonly slackAdapter: SlackBotAdapter,
    private readonly telegramAdapter: TelegramBotAdapter,
  ) {}

  @HttpCode(200)
  @Post('discord')
  async handleDiscordInteraction(
    @Req() request: RawBodyRequest<Request>,
    @Body() body: unknown,
    @Headers('x-signature-ed25519') signature: string,
    @Headers('x-signature-timestamp') timestamp: string,
  ): Promise<Record<string, unknown>> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const rawBody = request.rawBody;
    if (!rawBody) {
      this.loggerService.error(`${url} no raw body available`);
      throw new BadRequestException('Invalid request: missing body');
    }

    if (!signature || !timestamp) {
      this.loggerService.error(`${url} missing signature headers`);
      throw new BadRequestException('Invalid request: missing signature');
    }

    const isValid = await this.discordAdapter.validateSignature(
      rawBody,
      signature,
      timestamp,
    );

    if (!isValid) {
      this.loggerService.warn(`${url} invalid signature`);
      throw new HttpException(
        { detail: 'Invalid signature', title: 'Unauthorized' },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const interactionType = this.discordAdapter.getInteractionType(body);

    this.loggerService.log(`${url} received interaction`, {
      type: interactionType,
    });

    if (interactionType === BotInteractionType.PING) {
      this.loggerService.log(`${url} responding to PING`);
      return this.botGatewayService.handlePing(CredentialPlatform.DISCORD);
    }

    if (interactionType === BotInteractionType.APPLICATION_COMMAND) {
      const response = await this.botGatewayService.handleInteraction(
        CredentialPlatform.DISCORD,
        body,
      );

      switch (response.type) {
        case 'deferred':
          return this.discordAdapter.buildImmediateResponse(
            BotResponseType.DEFERRED_CHANNEL_MESSAGE,
          );

        case 'text':
        case 'error':
          return this.discordAdapter.buildImmediateResponse(
            BotResponseType.CHANNEL_MESSAGE,
            response.message,
          );

        case 'media':
          return {
            data: {
              content: response.message || '',
              embeds:
                response.mediaType === 'image'
                  ? [{ image: { url: response.mediaUrl } }]
                  : [],
            },
            type: BotResponseType.CHANNEL_MESSAGE,
          };

        default:
          return this.discordAdapter.buildImmediateResponse(
            BotResponseType.CHANNEL_MESSAGE,
            'Unknown response type',
          );
      }
    }

    this.loggerService.warn(`${url} unknown interaction type`, {
      type: interactionType,
    });

    return this.discordAdapter.buildImmediateResponse(
      BotResponseType.CHANNEL_MESSAGE,
      'Unsupported interaction type',
    );
  }

  @HttpCode(200)
  @Post('telegram')
  async handleTelegramEvent(
    @Req() request: RawBodyRequest<Request>,
    @Body() body: Record<string, unknown>,
    @Headers('x-telegram-bot-api-secret-token') secretToken: string,
  ): Promise<Record<string, unknown>> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const rawBody = request.rawBody || JSON.stringify(body);
    const isValid = await this.telegramAdapter.validateSignature(
      rawBody,
      secretToken,
    );

    if (!isValid) {
      this.loggerService.warn(`${url} invalid Telegram webhook secret`);
      throw new HttpException(
        { detail: 'Invalid signature', title: 'Unauthorized' },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const interactionType = this.telegramAdapter.getInteractionType(body);
    if (interactionType !== BotInteractionType.APPLICATION_COMMAND) {
      return { ok: true };
    }

    const response = await this.botGatewayService.handleInteraction(
      CredentialPlatform.TELEGRAM,
      body,
    );

    const chatId = this.telegramAdapter.extractChatId(body);
    if (!chatId) {
      this.loggerService.warn(`${url} could not resolve Telegram chat id`);
      return { ok: true };
    }

    if (response.type === 'media' && response.mediaUrl && response.mediaType) {
      await this.telegramAdapter.sendFollowupMedia(
        '',
        chatId,
        response.mediaUrl,
        response.mediaType,
        response.message,
      );
      return { ok: true };
    }

    await this.telegramAdapter.sendFollowupMessage(
      '',
      chatId,
      response.message || 'Command processed',
    );

    return { ok: true };
  }

  @HttpCode(200)
  @Post('slack')
  async handleSlackEvent(
    @Req() request: RawBodyRequest<Request>,
    @Body() body: Record<string, unknown>,
    @Headers('x-slack-signature') signature: string,
    @Headers('x-slack-request-timestamp') timestamp: string,
  ): Promise<Record<string, unknown>> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    // Handle URL verification challenge
    if (body.type === 'url_verification') {
      this.loggerService.log(`${url} responding to Slack URL verification`);
      return { challenge: body.challenge };
    }

    const rawBody = request.rawBody;
    if (!rawBody) {
      this.loggerService.error(`${url} no raw body available`);
      throw new BadRequestException('Invalid request: missing body');
    }

    if (!signature || !timestamp) {
      this.loggerService.error(`${url} missing Slack signature headers`);
      throw new BadRequestException('Invalid request: missing signature');
    }

    const isValid = await this.slackAdapter.validateSignature(
      rawBody,
      signature,
      timestamp,
    );

    if (!isValid) {
      this.loggerService.warn(`${url} invalid Slack signature`);
      throw new HttpException(
        { detail: 'Invalid signature', title: 'Unauthorized' },
        HttpStatus.UNAUTHORIZED,
      );
    }

    this.loggerService.log(`${url} received Slack event`, {
      type: body.type || body.command,
    });

    const interactionType = this.slackAdapter.getInteractionType(body);

    if (interactionType === BotInteractionType.APPLICATION_COMMAND) {
      const response = await this.botGatewayService.handleInteraction(
        CredentialPlatform.SLACK,
        body,
      );

      switch (response.type) {
        case 'deferred':
          return this.slackAdapter.buildImmediateResponse(
            BotResponseType.DEFERRED_CHANNEL_MESSAGE,
          );

        case 'text':
        case 'error':
          return this.slackAdapter.buildImmediateResponse(
            BotResponseType.CHANNEL_MESSAGE,
            response.message,
          );

        default:
          return this.slackAdapter.buildImmediateResponse(
            BotResponseType.CHANNEL_MESSAGE,
            response.message || 'Command processed',
          );
      }
    }

    return { ok: true };
  }
}
