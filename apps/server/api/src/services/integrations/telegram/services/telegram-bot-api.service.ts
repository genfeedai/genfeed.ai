import { DistributionContentType, ParseMode } from '@genfeedai/contracts';
import { Traced } from '@libs/tracing/traced';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

const TELEGRAM_API_BASE_URL = 'https://api.telegram.org';

interface TelegramApiResponse<TResult> {
  description?: string;
  error_code?: number;
  ok: boolean;
  parameters?: { retry_after?: number };
  result?: TResult;
}

interface TelegramMessage {
  message_id: number;
}

export interface TelegramSendInput {
  caption?: string;
  chatId: string;
  contentType: DistributionContentType;
  mediaUrl?: string;
  text?: string;
}

/**
 * What a failed Bot API call means, read from the HTTP status the API
 * returned and its `parameters.retry_after`, never from the description text
 * (Telegram documents only that `error_code` may change).
 */
export type TelegramApiFailureKind =
  /** 401: the bot token is not valid (revoked or wrong). */
  | 'token_invalid'
  /** 403: the bot was removed from the chat or blocked. */
  | 'bot_removed'
  /** 429: flood control; `retryAfterMs` says how long to wait. */
  | 'rate_limited'
  /** 400 and other 4xx: Telegram refused this content or chat. */
  | 'rejected'
  /** 5xx or no answer: the message may or may not have been sent. */
  | 'unavailable';

/** Stable code the publish worker reads (`error.code`), per failure kind. */
const FAILURE_CODES: Record<TelegramApiFailureKind, string> = {
  bot_removed: 'channel_disconnected',
  rate_limited: 'rate_limited',
  rejected: 'content_rejected',
  token_invalid: 'channel_disconnected',
  unavailable: 'provider_unavailable',
};

export class TelegramApiError extends Error {
  readonly code: string;
  readonly isRetryable: boolean;

  constructor(
    message: string,
    readonly kind: TelegramApiFailureKind,
    readonly statusCode: number | undefined,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'TelegramApiError';
    this.code = FAILURE_CODES[kind];
    this.isRetryable = kind === 'rate_limited' || kind === 'unavailable';
  }
}

function classifyFailure(
  statusCode: number | undefined,
): TelegramApiFailureKind {
  if (statusCode === 401) return 'token_invalid';
  if (statusCode === 403) return 'bot_removed';
  if (statusCode === 429) return 'rate_limited';
  if (statusCode === undefined || statusCode >= 500) return 'unavailable';
  return 'rejected';
}

/**
 * The one place that talks to the Telegram Bot API. The post pipeline
 * publisher and the one-off distribution path both send through it.
 */
@Traced()
@Injectable()
export class TelegramBotApiService {
  constructor(private readonly httpService: HttpService) {}

  async send(
    botToken: string,
    input: TelegramSendInput,
  ): Promise<{ messageId: string }> {
    const message = await this.sendMessage(botToken, input);
    return { messageId: String(message.message_id) };
  }

  private sendMessage(
    botToken: string,
    input: TelegramSendInput,
  ): Promise<TelegramMessage> {
    switch (input.contentType) {
      case DistributionContentType.TEXT:
        return this.call<TelegramMessage>(botToken, 'sendMessage', {
          chat_id: input.chatId,
          parse_mode: ParseMode.HTML,
          text: input.text || '',
        });
      case DistributionContentType.PHOTO:
        return this.call<TelegramMessage>(botToken, 'sendPhoto', {
          caption: input.caption,
          chat_id: input.chatId,
          parse_mode: ParseMode.HTML,
          photo: input.mediaUrl || '',
        });
      case DistributionContentType.VIDEO:
        return this.call<TelegramMessage>(botToken, 'sendVideo', {
          caption: input.caption,
          chat_id: input.chatId,
          parse_mode: ParseMode.HTML,
          video: input.mediaUrl || '',
        });
      default:
        throw new Error(`Unsupported content type: ${input.contentType}`);
    }
  }

  private async call<TResult>(
    botToken: string,
    method: string,
    body: Record<string, unknown>,
  ): Promise<TResult> {
    let statusCode: number | undefined;
    let payload: TelegramApiResponse<TResult> | undefined;
    try {
      const response = await firstValueFrom(
        this.httpService.post<TelegramApiResponse<TResult>>(
          `${TELEGRAM_API_BASE_URL}/bot${botToken}/${method}`,
          body,
          {
            headers: { 'Content-Type': 'application/json' },
            // Read Telegram's own error body instead of an axios exception
            // that carries the request URL, which contains the bot token.
            validateStatus: () => true,
          },
        ),
      );
      statusCode = response.status;
      payload = response.data;
    } catch (error: unknown) {
      throw new TelegramApiError(
        `Telegram ${method} did not answer: ${error instanceof Error ? error.name : 'request failed'}`,
        'unavailable',
        undefined,
      );
    }

    if (payload?.ok && payload.result !== undefined) {
      return payload.result;
    }

    const failureStatus = payload?.error_code ?? statusCode;
    const kind = classifyFailure(failureStatus);
    const retryAfter = payload?.parameters?.retry_after;
    throw new TelegramApiError(
      kind === 'rate_limited'
        ? `Telegram rate limit on ${method}`
        : `Telegram ${method} failed: ${payload?.description ?? 'no description'}`,
      kind,
      failureStatus,
      kind === 'rate_limited' && retryAfter !== undefined
        ? retryAfter * 1000
        : undefined,
    );
  }
}
