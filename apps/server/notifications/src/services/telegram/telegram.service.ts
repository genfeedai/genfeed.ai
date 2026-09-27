import { ParseMode } from '@genfeedai/contracts';
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
      if (!token) {
        this.loggerService.warn(
          'Telegram bot enabled but TELEGRAM_BOT_TOKEN is missing',
          this.context,
        );
        return;
      }
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

  public async sendMessage(chatId: string, text: string): Promise<boolean> {
    const url = `${TelegramService.name} ${CallerUtil.getCallerName()}`;

    if (!this.bot) {
      this.loggerService.warn(`${url} Bot not initialized`, this.context);
      return false;
    }

    try {
      await this.bot.api.sendMessage(chatId, text, {
        parse_mode: ParseMode.MARKDOWN,
      });
      return true;
    } catch (error: unknown) {
      this.loggerService.error(
        `${url} Failed to send message to ${chatId}`,
        error,
        this.context,
      );
      throw error;
    }
  }
}
