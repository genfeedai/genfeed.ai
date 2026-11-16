import { Traced } from '@libs/tracing/traced';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

const DISCORD_WEBHOOK_BASE_URL = 'https://discord.com/api/webhooks';

export interface DiscordWebhookFile {
  bytes: Uint8Array;
  contentType: string;
  filename: string;
}

export interface DiscordWebhookMessage {
  /** Plain text, at most 2000 characters. */
  content: string;
  files?: DiscordWebhookFile[];
}

/**
 * What a failed webhook call means, read from the HTTP status and the 429
 * body, never from message text.
 */
export type DiscordApiFailureKind =
  /** 401, 403 or 404: the webhook was deleted or the permission is gone. */
  | 'webhook_gone'
  /** 429: wait `retryAfterMs`. */
  | 'rate_limited'
  /** Other 4xx: Discord refused this message. */
  | 'rejected'
  /** 5xx or no answer: the message may or may not have been posted. */
  | 'unavailable';

const FAILURE_CODES: Record<DiscordApiFailureKind, string> = {
  rate_limited: 'rate_limited',
  rejected: 'content_rejected',
  unavailable: 'provider_unavailable',
  webhook_gone: 'channel_disconnected',
};

export class DiscordApiError extends Error {
  readonly code: string;
  readonly isRetryable: boolean;

  constructor(
    message: string,
    readonly kind: DiscordApiFailureKind,
    readonly statusCode: number | undefined,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'DiscordApiError';
    this.code = FAILURE_CODES[kind];
    this.isRetryable = kind === 'rate_limited' || kind === 'unavailable';
  }
}

interface DiscordMessageBody {
  channel_id?: string;
  id?: string;
  message?: string;
  retry_after?: number;
}

function classifyFailure(
  statusCode: number | undefined,
): DiscordApiFailureKind {
  if (statusCode === 401 || statusCode === 403 || statusCode === 404) {
    return 'webhook_gone';
  }
  if (statusCode === 429) return 'rate_limited';
  if (statusCode === undefined || statusCode >= 500) return 'unavailable';
  return 'rejected';
}

/** Posts a message through a channel webhook. */
@Traced()
@Injectable()
export class DiscordWebhookService {
  constructor(private readonly httpService: HttpService) {}

  /**
   * @param webhookPath the webhook's `<id>/<token>`
   */
  async execute(
    webhookPath: string,
    message: DiscordWebhookMessage,
  ): Promise<{ channelId: string | undefined; messageId: string }> {
    // `wait=true` makes Discord return the created message with its id.
    const url = `${DISCORD_WEBHOOK_BASE_URL}/${webhookPath}?wait=true`;
    // A text post never pings: mentions in a scheduled post are plain text.
    const payload = {
      allowed_mentions: { parse: [] as string[] },
      content: message.content,
    };

    let statusCode: number | undefined;
    let body: DiscordMessageBody | undefined;
    try {
      const response = await firstValueFrom(
        this.httpService.post<DiscordMessageBody>(
          url,
          message.files?.length
            ? this.buildMultipart(payload, message.files)
            : payload,
          // Read Discord's own error body instead of an axios exception that
          // carries the webhook URL, which contains its token.
          { validateStatus: () => true },
        ),
      );
      statusCode = response.status;
      body = response.data;
    } catch (error: unknown) {
      throw new DiscordApiError(
        `Discord did not answer: ${error instanceof Error ? error.name : 'request failed'}`,
        'unavailable',
        undefined,
      );
    }

    if (statusCode !== undefined && statusCode >= 200 && statusCode < 300) {
      if (!body?.id) {
        throw new DiscordApiError(
          'Discord accepted the message without returning its id',
          'unavailable',
          statusCode,
        );
      }
      return { channelId: body.channel_id, messageId: body.id };
    }

    const kind = classifyFailure(statusCode);
    throw new DiscordApiError(
      kind === 'rate_limited'
        ? 'Discord rate limit on the channel webhook'
        : `Discord refused the message: ${body?.message ?? `HTTP ${statusCode ?? 'unknown'}`}`,
      kind,
      statusCode,
      kind === 'rate_limited' && typeof body?.retry_after === 'number'
        ? Math.ceil(body.retry_after * 1000)
        : undefined,
    );
  }

  private buildMultipart(
    payload: Record<string, unknown>,
    files: DiscordWebhookFile[],
  ): FormData {
    const form = new FormData();
    form.append(
      'payload_json',
      JSON.stringify({
        ...payload,
        attachments: files.map((file, index) => ({
          filename: file.filename,
          id: index,
        })),
      }),
    );
    files.forEach((file, index) => {
      form.append(
        `files[${index}]`,
        new Blob([new Uint8Array(file.bytes)], { type: file.contentType }),
        file.filename,
      );
    });
    return form;
  }
}
