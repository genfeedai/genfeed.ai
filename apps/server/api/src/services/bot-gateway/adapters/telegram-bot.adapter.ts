import crypto from 'node:crypto';
import { ConfigService } from '@api/config/config.service';
import {
  BotCommandType,
  BotInteractionType,
  BotResponseType,
  CredentialPlatform,
} from '@genfeedai/enums';
import type { IBotMessage, IBotPlatformAdapter } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

interface TelegramUpdate {
  edited_message?: TelegramUpdateMessage;
  message?: TelegramUpdateMessage;
  update_id: number;
}

interface TelegramUpdateMessage {
  chat?: {
    id: number | string;
  };
  from?: {
    id: number | string;
  };
  text?: string;
}

@Injectable()
export class TelegramBotAdapter implements IBotPlatformAdapter {
  private readonly constructorName: string = String(this.constructor.name);
  readonly platform = CredentialPlatform.TELEGRAM;

  private readonly telegramApiBaseUrl: string;
  private readonly webhookSecret: string | undefined;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly loggerService: LoggerService,
  ) {
    const botToken = this.configService.get('TELEGRAM_BOT_TOKEN');
    this.telegramApiBaseUrl = botToken
      ? `https://api.telegram.org/bot${botToken}`
      : '';
    this.webhookSecret = this.configService.get('TELEGRAM_WEBHOOK_SECRET');
  }

  validateSignature(_body: Buffer | string, signature: string): boolean {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (!this.webhookSecret) {
      // Keep compatibility when secret is not configured.
      return true;
    }

    if (!signature) {
      this.loggerService.warn(`${url} missing Telegram webhook secret header`);
      return false;
    }

    const isValid =
      signature.length === this.webhookSecret.length &&
      crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(this.webhookSecret),
      );
    if (!isValid) {
      this.loggerService.warn(`${url} invalid Telegram webhook secret`);
    }

    return isValid;
  }

  getInteractionType(body: unknown): BotInteractionType | null {
    const message = this.getCommandMessage(body);
    if (!message?.text?.trim().startsWith('/')) {
      return null;
    }

    return BotInteractionType.APPLICATION_COMMAND;
  }

  parseMessage(body: unknown): IBotMessage | null {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const message = this.getCommandMessage(body);

    if (!message?.text || !message.chat?.id || !message.from?.id) {
      return null;
    }

    const [rawCommandToken, ...args] = message.text.trim().split(/\s+/);
    const commandToken = rawCommandToken
      .replace(/^\//, '')
      .split('@')[0]
      .toLowerCase();

    const commandMap: Record<string, BotCommandType> = {
      prompt_image: BotCommandType.PROMPT_IMAGE,
      prompt_video: BotCommandType.PROMPT_VIDEO,
      'prompt-image': BotCommandType.PROMPT_IMAGE,
      'prompt-video': BotCommandType.PROMPT_VIDEO,
      set_brand: BotCommandType.SET_BRAND,
      'set-brand': BotCommandType.SET_BRAND,
      status: BotCommandType.STATUS,
    };

    const command = commandMap[commandToken];
    if (!command) {
      this.loggerService.warn(`${url} unknown command`, { commandToken });
      return null;
    }

    const argsText = args.join(' ').trim();
    const chatId = String(message.chat.id);

    return {
      applicationId: 'telegram',
      brandName:
        command === BotCommandType.SET_BRAND && argsText ? argsText : undefined,
      chatId,
      command,
      interactionToken: chatId,
      platform: this.platform,
      platformUserId: String(message.from.id),
      prompt:
        (command === BotCommandType.PROMPT_IMAGE ||
          command === BotCommandType.PROMPT_VIDEO) &&
        argsText
          ? argsText
          : undefined,
      rawPayload: body,
    };
  }

  buildImmediateResponse(
    _type: BotResponseType,
    message?: string,
  ): Record<string, unknown> {
    return {
      message: message || 'ok',
      ok: true,
    };
  }

  async sendFollowupMessage(
    _applicationId: string,
    chatId: string,
    message: string,
  ): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.ensureTelegramApiConfigured(url);

    try {
      await firstValueFrom(
        this.httpService.post(
          `${this.telegramApiBaseUrl}/sendMessage`,
          {
            chat_id: chatId,
            parse_mode: 'Markdown',
            text: message,
          },
          {
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed to send Telegram message`, error);
      throw error;
    }
  }

  async sendFollowupMedia(
    _applicationId: string,
    chatId: string,
    mediaUrl: string,
    type: 'image' | 'video',
    caption?: string,
  ): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.ensureTelegramApiConfigured(url);

    const method = type === 'image' ? 'sendPhoto' : 'sendVideo';
    const mediaKey = type === 'image' ? 'photo' : 'video';

    try {
      await firstValueFrom(
        this.httpService.post(
          `${this.telegramApiBaseUrl}/${method}`,
          {
            [mediaKey]: mediaUrl,
            caption,
            chat_id: chatId,
            parse_mode: 'Markdown',
          },
          {
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed to send Telegram media`, error);
      throw error;
    }
  }

  extractChatId(body: unknown): string | null {
    const message = this.getCommandMessage(body);
    if (!message?.chat?.id) {
      return null;
    }
    return String(message.chat.id);
  }

  private getCommandMessage(body: unknown): TelegramUpdateMessage | undefined {
    const update = body as TelegramUpdate;
    return update?.message || update?.edited_message;
  }

  private ensureTelegramApiConfigured(url: string): void {
    if (!this.telegramApiBaseUrl) {
      this.loggerService.error(
        `${url} TELEGRAM_BOT_TOKEN not configured for bot gateway`,
      );
      throw new Error('TELEGRAM_BOT_TOKEN is not configured');
    }
  }
}
