import { ParseMode } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@notifications/config/config.service';
import { Bot } from 'grammy';

@Injectable()
export class TelegramService {
  private readonly context = { service: TelegramService.name };
  private bot: Bot | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
  ) {
    this.initBot();
  }

  public isAdmin(userId: number): boolean {
    const adminIds =
      this.configService.get('TELEGRAM_ADMIN_IDS')?.split(',') || [];
    return adminIds.includes(userId.toString());
  }

  private initBot(): void {
    if (!this.configService.isTelegramEnabled()) {
      this.loggerService.log(
        'Telegram bot not configured - skipping initialization',
        this.context,
      );
      return;
    }

    try {
      const token = this.configService.get('TELEGRAM_BOT_TOKEN');
      this.bot = new Bot(token);
      this.loggerService.log(
        'Telegram notification bot initialized (API-only mode)',
        this.context,
      );
    } catch (error: unknown) {
      this.loggerService.error(
        'Failed to initialize Telegram bot',
        error,
        this.context,
      );
    }
  }

  public async sendMessage(chatId: string, text: string): Promise<void> {
    const url = `${TelegramService.name} ${CallerUtil.getCallerName()}`;

    if (!this.bot) {
      this.loggerService.warn(`${url} Bot not initialized`, this.context);
      return;
    }

    try {
      await this.bot.api.sendMessage(chatId, text, {
        parse_mode: ParseMode.MARKDOWN,
      });
    } catch (error: unknown) {
      this.loggerService.error(
        `${url} Failed to send message to ${chatId}`,
        error,
        this.context,
      );
    }
  }

  public async sendPhoto(
    chatId: string,
    photoUrl: string,
    caption?: string,
  ): Promise<void> {
    const url = `${TelegramService.name} ${CallerUtil.getCallerName()}`;

    if (!this.bot) {
      this.loggerService.warn(`${url} Bot not initialized`, this.context);
      return;
    }

    try {
      await this.bot.api.sendPhoto(chatId, photoUrl, {
        caption,
        parse_mode: ParseMode.MARKDOWN,
      });
    } catch (error: unknown) {
      this.loggerService.error(
        `${url} Failed to send photo to ${chatId}`,
        error,
        this.context,
      );
    }
  }

  public async sendVideo(
    chatId: string,
    videoUrl: string,
    caption?: string,
  ): Promise<void> {
    const url = `${TelegramService.name} ${CallerUtil.getCallerName()}`;

    if (!this.bot) {
      this.loggerService.warn(`${url} Bot not initialized`, this.context);
      return;
    }

    try {
      await this.bot.api.sendVideo(chatId, videoUrl, {
        caption,
        parse_mode: ParseMode.MARKDOWN,
      });
    } catch (error: unknown) {
      this.loggerService.error(
        `${url} Failed to send video to ${chatId}`,
        error,
        this.context,
      );
    }
  }
}
