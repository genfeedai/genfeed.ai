import {
  readRetryAfterMs,
  toArticlePublishError,
} from '@api/services/integrations/publishers/article-publish-error.util';
import { PublishErrorKind } from '@genfeedai/contracts';
import { PublishError } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';

function httpError(
  status: number,
  headers: Record<string, string> = {},
): Error & { response: { status: number; headers: Record<string, string> } } {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { headers, status },
  });
}

function networkError(code: string): Error & { code: string } {
  return Object.assign(new Error(code), { code });
}

describe('toArticlePublishError', () => {
  it.each([
    [400, PublishErrorKind.CONTENT_REJECTED],
    [409, PublishErrorKind.CONTENT_REJECTED],
    [413, PublishErrorKind.CONTENT_REJECTED],
    [422, PublishErrorKind.CONTENT_REJECTED],
    [401, PublishErrorKind.CHANNEL_DISCONNECTED],
    [402, PublishErrorKind.CHANNEL_DISCONNECTED],
    [403, PublishErrorKind.CHANNEL_DISCONNECTED],
    [404, PublishErrorKind.CHANNEL_DISCONNECTED],
    [423, PublishErrorKind.CHANNEL_DISCONNECTED],
    [408, PublishErrorKind.OUTCOME_UNKNOWN],
    [500, PublishErrorKind.OUTCOME_UNKNOWN],
    [502, PublishErrorKind.OUTCOME_UNKNOWN],
    [503, PublishErrorKind.OUTCOME_UNKNOWN],
    [504, PublishErrorKind.OUTCOME_UNKNOWN],
    [429, PublishErrorKind.RATE_LIMITED],
  ])('maps HTTP %i to %s', (status, kind) => {
    const result = toArticlePublishError(httpError(status), {
      provider: 'Ghost',
    });

    expect(result).toBeInstanceOf(PublishError);
    expect(result.kind).toBe(kind);
    expect(result.httpStatus).toBe(status);
  });

  it('asks for a token refresh on 401 only when the token can be refreshed', () => {
    const refreshable = toArticlePublishError(httpError(401), {
      isTokenRefreshable: true,
      provider: 'Medium',
    });
    const fixed = toArticlePublishError(httpError(401), { provider: 'Medium' });

    expect(refreshable.kind).toBe(PublishErrorKind.TOKEN_MUST_REFRESH);
    expect(fixed.kind).toBe(PublishErrorKind.CHANNEL_DISCONNECTED);
  });

  it.each(['ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET', 'EPIPE'])(
    'treats %s as an unknown outcome because the request may have arrived',
    (code) => {
      expect(
        toArticlePublishError(networkError(code), { provider: 'WordPress' })
          .kind,
      ).toBe(PublishErrorKind.OUTCOME_UNKNOWN);
    },
  );

  it.each(['ENOTFOUND', 'ECONNREFUSED', 'EAI_AGAIN'])(
    'treats %s as retry_later because the request never left',
    (code) => {
      expect(
        toArticlePublishError(networkError(code), { provider: 'WordPress' })
          .kind,
      ).toBe(PublishErrorKind.RETRY_LATER);
    },
  );

  it('treats an error with no response and no code as an unknown outcome', () => {
    expect(
      toArticlePublishError(new TypeError('boom'), { provider: 'Dev.to' }).kind,
    ).toBe(PublishErrorKind.OUTCOME_UNKNOWN);
  });

  it('passes the provider reset time through on a rate limit', () => {
    const result = toArticlePublishError(
      httpError(429, { 'retry-after': '30' }),
      {
        provider: 'Dev.to',
      },
    );

    expect(result.retryAfterMs).toBe(30_000);
  });

  it('returns a PublishError unchanged', () => {
    const original = new PublishError(
      PublishErrorKind.CONTENT_REJECTED,
      'Too long',
    );

    expect(toArticlePublishError(original, { provider: 'Shopify' })).toBe(
      original,
    );
  });

  it('does not read the message text to pick the kind', () => {
    const error = Object.assign(new Error('rate limit exceeded, timeout 429'), {
      response: { headers: {}, status: 422 },
    });

    expect(toArticlePublishError(error, { provider: 'Ghost' }).kind).toBe(
      PublishErrorKind.CONTENT_REJECTED,
    );
  });
});

describe('readRetryAfterMs', () => {
  const now = new Date('2026-11-16T10:00:00.000Z');

  it('reads seconds', () => {
    expect(readRetryAfterMs(httpError(429, { 'retry-after': '12' }), now)).toBe(
      12_000,
    );
  });

  it('reads an HTTP date', () => {
    expect(
      readRetryAfterMs(
        httpError(429, { 'retry-after': 'Mon, 16 Nov 2026 10:01:00 GMT' }),
        now,
      ),
    ).toBe(60_000);
  });

  it('reads the header from an axios headers object', () => {
    const error = {
      response: {
        headers: {
          get: (name: string) => (name === 'retry-after' ? '5' : null),
        },
        status: 429,
      },
    };

    expect(readRetryAfterMs(error, now)).toBe(5_000);
  });

  it('is undefined when the header is missing or unreadable', () => {
    expect(readRetryAfterMs(httpError(429), now)).toBeUndefined();
    expect(
      readRetryAfterMs(httpError(429, { 'retry-after': 'soon' }), now),
    ).toBeUndefined();
  });
});
