import type {
  ProviderVerificationItem,
  ProviderVerificationPage,
} from '@api/services/integrations/publishers/interfaces/publish-verification.interface';
import { PROVIDER_VERIFICATION_PAGE_SIZE } from '@api/services/integrations/publishers/publisher-verification.util';
import { isRecord } from '@genfeedai/utils/data/extract.util';
import { ConfigService } from '@libs/config/config.service';
import { Traced } from '@libs/tracing/traced';
import { HttpService } from '@nestjs/axios';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { AxiosResponse } from 'axios';
import { firstValueFrom, type Observable } from 'rxjs';

const SLACK_AUTHORIZE_URL = 'https://slack.com/oauth/v2/authorize';
const SLACK_API_URL = 'https://slack.com/api';

/**
 * Bot scopes: post (`chat:write`, and `chat:write.public` so a public channel
 * needs no invite), list the channels to pick from, and read channel history
 * so an unconfirmed post can be looked up before a retry.
 */
const SLACK_BOT_SCOPES = [
  'chat:write',
  'chat:write.public',
  'channels:read',
  'groups:read',
  'channels:history',
  'groups:history',
];

export interface SlackInstallation {
  accessToken: string;
  botUserId: string | undefined;
  teamId: string;
  teamName: string | undefined;
}

export interface SlackChannel {
  id: string;
  isPrivate: boolean;
  name: string;
}

/**
 * What a failed Slack call means. Slack answers most failures with HTTP 200
 * and a documented `error` code; a rate limit is HTTP 429 with `Retry-After`.
 */
export type SlackApiFailureKind =
  /** `token_revoked`, `account_inactive`, `invalid_auth`. */
  | 'token_revoked'
  /** `not_in_channel`, `channel_not_found`, `is_archived`. */
  | 'channel_unavailable'
  /** HTTP 429 (or `ratelimited`): wait `retryAfterMs`. */
  | 'rate_limited'
  /** Any other documented error: Slack refused this message. */
  | 'rejected'
  /** 5xx or no answer: the message may or may not have been posted. */
  | 'unavailable';

const FAILURE_CODES: Record<SlackApiFailureKind, string> = {
  channel_unavailable: 'channel_disconnected',
  rate_limited: 'rate_limited',
  rejected: 'content_rejected',
  token_revoked: 'channel_disconnected',
  unavailable: 'provider_unavailable',
};

const TOKEN_ERRORS = new Set([
  'token_revoked',
  'account_inactive',
  'invalid_auth',
]);
const CHANNEL_ERRORS = new Set([
  'not_in_channel',
  'channel_not_found',
  'is_archived',
]);

export class SlackApiError extends Error {
  readonly code: string;
  readonly isRetryable: boolean;

  constructor(
    message: string,
    readonly kind: SlackApiFailureKind,
    readonly statusCode: number | undefined,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'SlackApiError';
    this.code = FAILURE_CODES[kind];
    this.isRetryable = kind === 'rate_limited' || kind === 'unavailable';
  }
}

interface SlackResponse {
  channel?: unknown;
  channels?: unknown;
  error?: string;
  messages?: unknown;
  ok?: boolean;
  permalink?: string;
  response_metadata?: { next_cursor?: string };
  ts?: string;
}

function classifyError(error: string | undefined): SlackApiFailureKind {
  if (error === 'ratelimited' || error === 'rate_limited')
    return 'rate_limited';
  if (error && TOKEN_ERRORS.has(error)) return 'token_revoked';
  if (error && CHANNEL_ERRORS.has(error)) return 'channel_unavailable';
  return 'rejected';
}

function readRetryAfterMs(headers: unknown): number | undefined {
  if (!isRecord(headers)) return undefined;
  const seconds = Number(headers['retry-after']);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined;
}

@Traced()
@Injectable()
export class SlackService {
  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  generateAuthUrl(state: string): string {
    const clientId = this.configService.get('SLACK_CLIENT_ID');
    const redirectUri = this.configService.get('SLACK_REDIRECT_URI');
    if (!clientId || !redirectUri) {
      throw new HttpException(
        {
          detail:
            'Slack OAuth configuration is missing. Set SLACK_CLIENT_ID and SLACK_REDIRECT_URI.',
          title: 'Configuration Error',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: SLACK_BOT_SCOPES.join(','),
      state,
    });
    return `${SLACK_AUTHORIZE_URL}?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string): Promise<SlackInstallation> {
    const clientId = this.configService.get('SLACK_CLIENT_ID');
    const clientSecret = this.configService.get('SLACK_CLIENT_SECRET');
    const redirectUri = this.configService.get('SLACK_REDIRECT_URI');
    if (!clientId || !clientSecret || !redirectUri) {
      throw new HttpException(
        {
          detail:
            'Slack OAuth configuration is missing. Set SLACK_CLIENT_ID, SLACK_CLIENT_SECRET and SLACK_REDIRECT_URI.',
          title: 'Configuration Error',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const response = await firstValueFrom(
      this.httpService.post<{
        access_token?: string;
        bot_user_id?: string;
        error?: string;
        ok?: boolean;
        team?: { id?: string; name?: string };
      }>(
        `${SLACK_API_URL}/oauth.v2.access`,
        new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
        }).toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          validateStatus: () => true,
        },
      ),
    );

    const { data } = response;
    if (!data?.ok || !data.access_token || !data.team?.id) {
      throw new HttpException(
        {
          detail: `Slack did not grant access${data?.error ? `: ${data.error}` : ''}`,
          title: 'Token exchange failed',
        },
        HttpStatus.BAD_GATEWAY,
      );
    }

    return {
      accessToken: data.access_token,
      botUserId: data.bot_user_id,
      teamId: data.team.id,
      teamName: data.team.name,
    };
  }

  /** Public and private channels the app can see, first 1000 at most. */
  async listChannels(botToken: string): Promise<SlackChannel[]> {
    const channels: SlackChannel[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 5; page++) {
      const data = await this.callGet(botToken, 'conversations.list', {
        exclude_archived: true,
        limit: 200,
        types: 'public_channel,private_channel',
        ...(cursor ? { cursor } : {}),
      });
      for (const item of Array.isArray(data.channels) ? data.channels : []) {
        if (isRecord(item) && typeof item.id === 'string') {
          channels.push({
            id: item.id,
            isPrivate: item.is_private === true,
            name: typeof item.name === 'string' ? item.name : item.id,
          });
        }
      }
      cursor = data.response_metadata?.next_cursor || undefined;
      if (!cursor) break;
    }
    return channels;
  }

  /**
   * Post a message. `text` is mrkdwn; images ride along as legacy
   * attachments so the whole text keeps Slack's full text limit.
   */
  async postMessage(
    botToken: string,
    input: { channelId: string; imageUrls: string[]; text: string },
  ): Promise<{ channelId: string; ts: string }> {
    const data = await this.call(botToken, 'chat.postMessage', {
      attachments: input.imageUrls.map((imageUrl) => ({
        fallback: 'Image',
        image_url: imageUrl,
      })),
      channel: input.channelId,
      mrkdwn: true,
      text: input.text,
      unfurl_links: true,
    });
    if (typeof data.ts !== 'string' || typeof data.channel !== 'string') {
      throw new SlackApiError(
        'Slack accepted the message without returning its timestamp',
        'unavailable',
        200,
      );
    }
    return { channelId: data.channel, ts: data.ts };
  }

  /** The permalink, or null when Slack cannot produce one (the post stands). */
  async getPermalink(
    botToken: string,
    channelId: string,
    ts: string,
  ): Promise<string | null> {
    try {
      const data = await this.callGet(botToken, 'chat.getPermalink', {
        channel: channelId,
        message_ts: ts,
      });
      return data.permalink ?? null;
    } catch {
      return null;
    }
  }

  /** One page of the channel's messages since the attempt, for verification. */
  async listPublishVerificationPage(
    botToken: string,
    channelId: string,
    attemptStartedAt: Date,
    cursor?: string,
  ): Promise<ProviderVerificationPage> {
    const data = await this.callGet(botToken, 'conversations.history', {
      channel: channelId,
      limit: PROVIDER_VERIFICATION_PAGE_SIZE,
      oldest: String(Math.floor(attemptStartedAt.getTime() / 1000)),
      ...(cursor ? { cursor } : {}),
    });
    const items: ProviderVerificationItem[] = [];
    for (const message of Array.isArray(data.messages) ? data.messages : []) {
      // Only messages an app posted can be this post; a person's identical
      // text is not evidence.
      if (
        !isRecord(message) ||
        typeof message.ts !== 'string' ||
        typeof message.bot_id !== 'string'
      ) {
        continue;
      }
      items.push({
        createdAt: new Date(Number(message.ts) * 1000),
        hasMedia:
          (Array.isArray(message.files) && message.files.length > 0) ||
          (Array.isArray(message.attachments) &&
            message.attachments.length > 0),
        id: message.ts,
        isReply:
          typeof message.thread_ts === 'string' &&
          message.thread_ts !== message.ts,
        text: typeof message.text === 'string' ? message.text : '',
      });
    }
    return { items, nextCursor: data.response_metadata?.next_cursor || null };
  }

  /** Read methods take their arguments in the query string. */
  private callGet(
    botToken: string,
    method: string,
    params: Record<string, unknown>,
  ): Promise<SlackResponse> {
    return this.send(method, () =>
      this.httpService.get<SlackResponse>(`${SLACK_API_URL}/${method}`, {
        headers: { Authorization: `Bearer ${botToken}` },
        params,
        validateStatus: () => true,
      }),
    );
  }

  private call(
    botToken: string,
    method: string,
    params: Record<string, unknown>,
  ): Promise<SlackResponse> {
    return this.send(method, () =>
      this.httpService.post<SlackResponse>(
        `${SLACK_API_URL}/${method}`,
        params,
        {
          headers: {
            Authorization: `Bearer ${botToken}`,
            'Content-Type': 'application/json; charset=utf-8',
          },
          validateStatus: () => true,
        },
      ),
    );
  }

  private async send(
    method: string,
    request: () => Observable<AxiosResponse<SlackResponse>>,
  ): Promise<SlackResponse> {
    let statusCode: number | undefined;
    let data: SlackResponse | undefined;
    let retryAfterMs: number | undefined;
    try {
      const response = await firstValueFrom(request());
      statusCode = response.status;
      data = response.data;
      retryAfterMs = readRetryAfterMs(response.headers);
    } catch (error: unknown) {
      throw new SlackApiError(
        `Slack ${method} did not answer: ${error instanceof Error ? error.name : 'request failed'}`,
        'unavailable',
        undefined,
      );
    }

    if (statusCode === 429) {
      throw new SlackApiError(
        `Slack rate limit on ${method}`,
        'rate_limited',
        429,
        retryAfterMs,
      );
    }
    if (statusCode !== undefined && statusCode >= 500) {
      throw new SlackApiError(
        `Slack ${method} is unavailable`,
        'unavailable',
        statusCode,
      );
    }
    if (data?.ok) {
      return data;
    }

    const kind = classifyError(data?.error);
    throw new SlackApiError(
      kind === 'rate_limited'
        ? `Slack rate limit on ${method}`
        : `Slack ${method} failed: ${data?.error ?? `HTTP ${statusCode ?? 'unknown'}`}`,
      kind,
      statusCode,
      kind === 'rate_limited' ? retryAfterMs : undefined,
    );
  }
}
