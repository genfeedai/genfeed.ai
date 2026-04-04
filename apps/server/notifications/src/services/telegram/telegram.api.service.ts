import { ParseMode } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

interface TelegramBot {
  editMessageReplyMarkup(
    replyMarkup: unknown,
    options: unknown,
  ): Promise<unknown>;
  editMessageText(text: string, options: unknown): Promise<unknown>;
  sendMessage(
    chatId: string,
    text: string,
    options: unknown,
  ): Promise<TelegramMessage>;
  sendPhoto(
    chatId: string,
    photo: string,
    options: unknown,
  ): Promise<TelegramMessage>;
  sendVideo(chatId: string, video: string, options: unknown): Promise<unknown>;
  sendDocument(
    chatId: string,
    document: unknown,
    options: unknown,
  ): Promise<unknown>;
  deleteMessage(chatId: string, messageId: string): Promise<unknown>;
}

interface TelegramMessage {
  message_id: string;
}

interface TelegramButton {
  callback_data: string;
  text: string;
}

interface TelegramMessageOptions {
  parse_mode: string;
  reply_markup: { inline_keyboard: TelegramButton[][] };
  reply_to_message_id?: string;
  message_thread_id?: string;
  caption?: string;
  chat_id?: string;
  message_id?: string | null;
}

interface TelegramError {
  description?: string;
  message?: string;
  error_code?: number;
}

@Injectable()
export class TelegramAPIService {
  private readonly context = { service: TelegramAPIService.name };

  constructor(private readonly loggerService: LoggerService) {}

  private escapeHtml(text: string): string {
    if (!text) {
      return '';
    }
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }

  public sanitizeUserInput(input: string | undefined | null): string {
    if (!input) {
      return '';
    }
    return this.escapeHtml(input);
  }

  public async sendLoading(
    bot: TelegramBot,
    chatId: string,
    threadId: string,
    messageId: string,
    buttons: TelegramButton[][] = [[{ callback_data: 'close', text: 'Close' }]],
  ): Promise<string | undefined> {
    const loading = await this.sendMessage(
      bot,
      chatId,
      threadId,
      messageId,
      '',
      '... Loading...',
      buttons,
    );
    return loading?.message_id;
  }

  public editButtons(
    bot: TelegramBot,
    chatId: string,
    messageId: string,
    buttons: TelegramButton[][] = [],
  ): Promise<unknown> {
    return bot.editMessageReplyMarkup(
      { inline_keyboard: buttons },
      { chat_id: chatId, message_id: messageId },
    );
  }

  public async sendMessage(
    bot: TelegramBot,
    chatId: string,
    threadId: string | null,
    messageId: string | null,
    photoUrl: string | null,
    caption: string | null,
    buttons: TelegramButton[][] = [],
    isEdit: boolean = false,
  ): Promise<TelegramMessage | undefined> {
    try {
      const options: TelegramMessageOptions = {
        parse_mode: ParseMode.HTML,
        reply_markup: { inline_keyboard: buttons },
      };

      if (messageId && !isEdit) {
        options.reply_to_message_id = messageId;
      }

      if (threadId) {
        options.message_thread_id = threadId;
      }

      if (isEdit) {
        return (await bot.editMessageText(caption || '', {
          chat_id: chatId,
          message_id: messageId,
          ...options,
        })) as TelegramMessage;
      }

      if (photoUrl) {
        return await bot.sendPhoto(chatId, photoUrl, { caption, ...options });
      }

      return await bot.sendMessage(chatId, caption || '', options);
    } catch (err: unknown) {
      const telegramError = err as TelegramError;
      this.loggerService.error(
        'sendMessage failed',
        {
          description: telegramError.description,
          message: telegramError.message,
          status: telegramError.error_code,
        },
        this.context,
      );
    }
  }

  public async sendVideo(
    bot: TelegramBot,
    chatId: string,
    videoUrl: string,
    caption: string,
    buttons: TelegramButton[][] = [],
    replyToMessageId?: string,
  ): Promise<unknown> {
    try {
      const options: TelegramMessageOptions = {
        caption,
        parse_mode: ParseMode.HTML,
        reply_markup: { inline_keyboard: buttons },
      };

      if (replyToMessageId) {
        options.reply_to_message_id = replyToMessageId;
      }

      return await bot.sendVideo(chatId, videoUrl, options);
    } catch (err) {
      this.loggerService.error('sendVideo failed', err, this.context);
    }
  }

  public async sendDocument(
    bot: TelegramBot,
    chatId: string,
    document: unknown,
    caption: string,
    buttons: TelegramButton[][] = [],
  ): Promise<unknown> {
    try {
      const options: TelegramMessageOptions = {
        caption,
        parse_mode: ParseMode.HTML,
        reply_markup: { inline_keyboard: buttons },
      };

      return await bot.sendDocument(chatId, document, options);
    } catch (err) {
      this.loggerService.error('sendDocument failed', err, this.context);
    }
  }

  public async deleteMessage(
    bot: TelegramBot,
    chatId: string,
    messageId: string,
  ): Promise<unknown> {
    try {
      return await bot.deleteMessage(chatId, messageId);
    } catch (err) {
      this.loggerService.error('deleteMessage failed', err, this.context);
    }
  }
}
