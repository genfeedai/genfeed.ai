import {
  TelegramApiError,
  TelegramBotApiService,
} from '@api/services/integrations/telegram/services/telegram-bot-api.service';
import { DistributionContentType } from '@genfeedai/contracts';
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
    service: new TelegramBotApiService(http as unknown as HttpService),
  };
}

async function failureOf(promise: Promise<unknown>): Promise<TelegramApiError> {
  try {
    await promise;
  } catch (error: unknown) {
    return error as TelegramApiError;
  }
  throw new Error('expected the call to fail');
}

const textInput = {
  chatId: '@genfeed',
  contentType: DistributionContentType.TEXT,
  text: 'Hello',
};

describe('TelegramBotApiService', () => {
  it('returns the message id of a sent text message', async () => {
    const { requests, service } = buildService(200, {
      ok: true,
      result: { message_id: 77 },
    });

    const result = await service.send('123:abc', textInput);

    expect(result).toEqual({ messageId: '77' });
    expect(requests).toEqual([
      {
        body: { chat_id: '@genfeed', parse_mode: 'HTML', text: 'Hello' },
        url: 'https://api.telegram.org/bot123:abc/sendMessage',
      },
    ]);
  });

  it('reads the stated wait on flood control', async () => {
    const { service } = buildService(429, {
      description: 'Too Many Requests',
      error_code: 429,
      ok: false,
      parameters: { retry_after: 12 },
    });

    const error = await failureOf(service.send('123:abc', textInput));

    expect(error).toMatchObject({
      code: 'rate_limited',
      isRetryable: true,
      kind: 'rate_limited',
      retryAfterMs: 12000,
    });
  });

  it.each([
    [401, 'token_invalid', 'channel_disconnected', false],
    [403, 'bot_removed', 'channel_disconnected', false],
    [400, 'rejected', 'content_rejected', false],
    [502, 'unavailable', 'provider_unavailable', true],
  ] as const)(
    'classifies HTTP %i as %s',
    async (status, kind, code, isRetryable) => {
      const { service } = buildService(status, {
        description: 'refused',
        error_code: status,
        ok: false,
      });

      const error = await failureOf(service.send('123:abc', textInput));

      expect(error).toMatchObject({ code, isRetryable, kind });
    },
  );

  it('keeps the bot token out of the error message', async () => {
    const { service } = buildService(401, {
      description: 'Unauthorized',
      error_code: 401,
      ok: false,
    });

    const error = await failureOf(service.send('123:secret-part', textInput));

    expect(error.message).not.toContain('secret-part');
  });
});
