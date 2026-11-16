import {
  DiscordApiError,
  DiscordWebhookService,
} from '@api/services/integrations/discord/services/discord-webhook.service';
import type { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';

function buildService(status: number, data: unknown) {
  const requests: Array<{ body: unknown; url: string }> = [];
  const http = {
    post: (url: string, body: unknown) => {
      requests.push({ body, url });
      return of({ data, status });
    },
  };
  return {
    requests,
    service: new DiscordWebhookService(http as unknown as HttpService),
  };
}

async function failureOf(promise: Promise<unknown>): Promise<DiscordApiError> {
  try {
    await promise;
  } catch (error: unknown) {
    return error as DiscordApiError;
  }
  throw new Error('expected the call to fail');
}

describe('DiscordWebhookService', () => {
  it('posts without pings and returns the created message', async () => {
    const { requests, service } = buildService(200, {
      channel_id: '222',
      id: '999',
    });

    const result = await service.execute('111/token-abc', {
      content: 'Hi @everyone',
    });

    expect(result).toEqual({ channelId: '222', messageId: '999' });
    expect(requests).toEqual([
      {
        body: { allowed_mentions: { parse: [] }, content: 'Hi @everyone' },
        url: 'https://discord.com/api/webhooks/111/token-abc?wait=true',
      },
    ]);
  });

  it('sends files as multipart with the message in payload_json', async () => {
    const { requests, service } = buildService(200, {
      channel_id: '2',
      id: '9',
    });

    await service.execute('111/token-abc', {
      content: 'Look',
      files: [
        {
          bytes: new Uint8Array([1, 2, 3]),
          contentType: 'image/png',
          filename: 'media-1.png',
        },
      ],
    });

    const form = requests[0].body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(JSON.parse(String(form.get('payload_json')))).toEqual({
      allowed_mentions: { parse: [] },
      attachments: [{ filename: 'media-1.png', id: 0 }],
      content: 'Look',
    });
    expect((form.get('files[0]') as File).name).toBe('media-1.png');
  });

  it('waits the stated time on a rate limit', async () => {
    const { service } = buildService(429, {
      global: false,
      message: 'You are being rate limited.',
      retry_after: 1.5,
    });

    const error = await failureOf(service.execute('111/t', { content: 'x' }));

    expect(error).toMatchObject({
      code: 'rate_limited',
      isRetryable: true,
      retryAfterMs: 1500,
    });
  });

  it.each([
    [404, 'webhook_gone', 'channel_disconnected', false],
    [401, 'webhook_gone', 'channel_disconnected', false],
    [403, 'webhook_gone', 'channel_disconnected', false],
    [400, 'rejected', 'content_rejected', false],
    [503, 'unavailable', 'provider_unavailable', true],
  ] as const)(
    'classifies HTTP %i as %s',
    async (status, kind, code, isRetryable) => {
      const { service } = buildService(status, { message: 'nope' });

      const error = await failureOf(service.execute('111/t', { content: 'x' }));

      expect(error).toMatchObject({ code, isRetryable, kind });
    },
  );

  it('keeps the webhook token out of the error message', async () => {
    const { service } = buildService(404, { message: 'Unknown Webhook' });

    const error = await failureOf(
      service.execute('111/secret-token', { content: 'x' }),
    );

    expect(error.message).not.toContain('secret-token');
  });
});
