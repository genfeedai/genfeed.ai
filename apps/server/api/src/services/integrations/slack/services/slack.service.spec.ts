import {
  SlackApiError,
  SlackService,
} from '@api/services/integrations/slack/services/slack.service';
import type { ConfigService } from '@libs/config/config.service';
import type { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';

type Reply = {
  data: unknown;
  headers?: Record<string, string>;
  status: number;
};

function buildService(reply: Reply) {
  const requests: Array<{
    body: unknown;
    method: 'GET' | 'POST';
    url: string;
  }> = [];
  const http = {
    get: (url: string, config: { params?: unknown }) => {
      requests.push({ body: config.params, method: 'GET', url });
      return of(reply);
    },
    post: (url: string, body: unknown) => {
      requests.push({ body, method: 'POST', url });
      return of(reply);
    },
  };
  const config = {
    get: (key: string) =>
      ({
        SLACK_CLIENT_ID: 'client-id',
        SLACK_CLIENT_SECRET: 'client-secret',
        SLACK_REDIRECT_URI: 'https://app.example.test/oauth/slack',
      })[key],
  };
  return {
    requests,
    service: new SlackService(
      config as unknown as ConfigService,
      http as unknown as HttpService,
    ),
  };
}

async function failureOf(promise: Promise<unknown>): Promise<SlackApiError> {
  try {
    await promise;
  } catch (error: unknown) {
    return error as SlackApiError;
  }
  throw new Error('expected the call to fail');
}

describe('SlackService', () => {
  it('builds an authorize URL with the bot scopes and state', () => {
    const { service } = buildService({ data: {}, status: 200 });

    const url = new URL(service.generateAuthUrl('state-1'));

    expect(url.origin + url.pathname).toBe(
      'https://slack.com/oauth/v2/authorize',
    );
    expect(url.searchParams.get('state')).toBe('state-1');
    expect(url.searchParams.get('scope')).toContain('chat:write');
  });

  it('returns the channel and timestamp of a posted message', async () => {
    const { requests, service } = buildService({
      data: { channel: 'C1', ok: true, ts: '1700000000.000100' },
      status: 200,
    });

    const result = await service.postMessage('xoxb-token', {
      channelId: 'C1',
      imageUrls: ['https://cdn.example.test/a.png'],
      text: 'Hello',
    });

    expect(result).toEqual({ channelId: 'C1', ts: '1700000000.000100' });
    expect(requests[0].body).toMatchObject({
      attachments: [
        { fallback: 'Image', image_url: 'https://cdn.example.test/a.png' },
      ],
      channel: 'C1',
      text: 'Hello',
    });
  });

  it('lists channels with their privacy', async () => {
    const { service } = buildService({
      data: {
        channels: [
          { id: 'C1', is_private: false, name: 'general' },
          { id: 'G2', is_private: true, name: 'team' },
        ],
        ok: true,
        response_metadata: { next_cursor: '' },
      },
      status: 200,
    });

    expect(await service.listChannels('xoxb-token')).toEqual([
      { id: 'C1', isPrivate: false, name: 'general' },
      { id: 'G2', isPrivate: true, name: 'team' },
    ]);
  });

  it('reads Retry-After on HTTP 429', async () => {
    const { service } = buildService({
      data: { error: 'ratelimited', ok: false },
      headers: { 'retry-after': '30' },
      status: 429,
    });

    const error = await failureOf(
      service.postMessage('xoxb-token', {
        channelId: 'C1',
        imageUrls: [],
        text: 'x',
      }),
    );

    expect(error).toMatchObject({
      code: 'rate_limited',
      isRetryable: true,
      retryAfterMs: 30000,
    });
  });

  it.each([
    ['token_revoked', 'token_revoked', 'channel_disconnected', false],
    ['invalid_auth', 'token_revoked', 'channel_disconnected', false],
    ['not_in_channel', 'channel_unavailable', 'channel_disconnected', false],
    ['is_archived', 'channel_unavailable', 'channel_disconnected', false],
    ['invalid_blocks', 'rejected', 'content_rejected', false],
  ] as const)(
    'classifies the Slack error %s as %s',
    async (slackError, kind, code, isRetryable) => {
      const { service } = buildService({
        data: { error: slackError, ok: false },
        status: 200,
      });

      const error = await failureOf(
        service.postMessage('xoxb-token', {
          channelId: 'C1',
          imageUrls: [],
          text: 'x',
        }),
      );

      expect(error).toMatchObject({ code, isRetryable, kind });
    },
  );

  it('treats a server error as an unknown outcome', async () => {
    const { service } = buildService({ data: {}, status: 502 });

    const error = await failureOf(
      service.postMessage('xoxb-token', {
        channelId: 'C1',
        imageUrls: [],
        text: 'x',
      }),
    );

    expect(error).toMatchObject({
      code: 'provider_unavailable',
      isRetryable: true,
    });
  });

  it('gives no permalink when Slack cannot produce one', async () => {
    const { service } = buildService({
      data: { error: 'message_not_found', ok: false },
      status: 200,
    });

    expect(await service.getPermalink('xoxb-token', 'C1', '1.1')).toBeNull();
  });

  it('keeps only app-posted messages as verification evidence', async () => {
    const { service } = buildService({
      data: {
        messages: [
          { bot_id: 'B1', text: 'Ship it', ts: '1700000005.000100' },
          { text: 'Ship it', ts: '1700000006.000100', user: 'U1' },
        ],
        ok: true,
        response_metadata: { next_cursor: '' },
      },
      status: 200,
    });

    const page = await service.listPublishVerificationPage(
      'xoxb-token',
      'C1',
      new Date('2023-11-14T22:13:20Z'),
    );

    expect(page.nextCursor).toBeNull();
    expect(page.items).toEqual([
      {
        createdAt: new Date(1700000005000),
        hasMedia: false,
        id: '1700000005.000100',
        isReply: false,
        text: 'Ship it',
      },
    ]);
  });
});
