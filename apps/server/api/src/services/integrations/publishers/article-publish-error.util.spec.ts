import { toArticlePublishError } from '@api/services/integrations/publishers/article-publish-error.util';
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
    const result = toArticlePublishError(httpError(status));

    expect(result).toBeInstanceOf(PublishError);
    expect(result.kind).toBe(kind);
    expect(result.httpStatus).toBe(status);
  });

  it('asks for a token refresh on 401 only when the token can be refreshed', () => {
    const refreshable = toArticlePublishError(httpError(401), {
      isTokenRefreshable: true,
    });
    const fixed = toArticlePublishError(httpError(401), {});

    expect(refreshable.kind).toBe(PublishErrorKind.TOKEN_MUST_REFRESH);
    expect(fixed.kind).toBe(PublishErrorKind.CHANNEL_DISCONNECTED);
  });

  it.each(['ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET', 'EPIPE'])(
    'treats %s as an unknown outcome because the request may have arrived',
    (code) => {
      expect(toArticlePublishError(networkError(code)).kind).toBe(
        PublishErrorKind.OUTCOME_UNKNOWN,
      );
    },
  );

  it.each(['ENOTFOUND', 'ECONNREFUSED', 'EAI_AGAIN'])(
    'treats %s as retry_later because the request never left',
    (code) => {
      expect(toArticlePublishError(networkError(code)).kind).toBe(
        PublishErrorKind.RETRY_LATER,
      );
    },
  );

  it('treats an error with no response and no code as an unknown outcome', () => {
    expect(toArticlePublishError(new TypeError('boom')).kind).toBe(
      PublishErrorKind.OUTCOME_UNKNOWN,
    );
  });

  it('passes the provider reset time through on a rate limit', () => {
    const result = toArticlePublishError(
      httpError(429, { 'retry-after': '30' }),
    );

    expect(result.retryAfterMs).toBe(30_000);
  });

  it('reads an HTTP date Retry-After on a rate limit', () => {
    const result = toArticlePublishError(
      httpError(429, {
        'retry-after': new Date(Date.now() + 60_000).toUTCString(),
      }),
    );

    expect(result.retryAfterMs).toBeGreaterThan(50_000);
    expect(result.retryAfterMs).toBeLessThanOrEqual(60_000);
  });

  it('reports no wait when the provider gave none', () => {
    expect(toArticlePublishError(httpError(429)).retryAfterMs).toBeUndefined();
  });

  it('returns a PublishError unchanged', () => {
    const original = new PublishError(
      PublishErrorKind.CONTENT_REJECTED,
      'Too long',
    );

    expect(toArticlePublishError(original)).toBe(original);
  });

  it('does not read the message text to pick the kind', () => {
    const error = Object.assign(new Error('rate limit exceeded, timeout 429'), {
      response: { headers: {}, status: 422 },
    });

    expect(toArticlePublishError(error).kind).toBe(
      PublishErrorKind.CONTENT_REJECTED,
    );
  });
});
