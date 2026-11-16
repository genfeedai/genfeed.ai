import { classifyHttpPublishError } from '@api/shared/utils/publish-error/classify-http-publish-error.util';
import { PublishErrorKind } from '@genfeedai/contracts';
import { PublishError } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';

function httpFailure(status: number, headers: Record<string, string> = {}) {
  return Object.assign(new Error(`Request failed with status ${status}`), {
    response: { headers, status },
  });
}

describe('classifyHttpPublishError', () => {
  it.each([
    [401, true, PublishErrorKind.TOKEN_MUST_REFRESH],
    [403, true, PublishErrorKind.CHANNEL_DISCONNECTED],
    [400, true, PublishErrorKind.CONTENT_REJECTED],
    [404, true, PublishErrorKind.CONTENT_REJECTED],
    [422, true, PublishErrorKind.CONTENT_REJECTED],
    [429, true, PublishErrorKind.RATE_LIMITED],
    [408, true, PublishErrorKind.OUTCOME_UNKNOWN],
    [500, true, PublishErrorKind.OUTCOME_UNKNOWN],
    [503, true, PublishErrorKind.OUTCOME_UNKNOWN],
    [500, false, PublishErrorKind.RETRY_LATER],
    [503, false, PublishErrorKind.RETRY_LATER],
  ])(
    'reads status %i (publish request: %s) as %s',
    (status, isPublishRequest, kind) => {
      const result = classifyHttpPublishError(httpFailure(status), {
        isPublishRequest,
      });

      expect(result).toBeInstanceOf(PublishError);
      expect(result.kind).toBe(kind);
      expect(result.httpStatus).toBe(status);
    },
  );

  it.each([
    ['ETIMEDOUT', true, PublishErrorKind.OUTCOME_UNKNOWN],
    ['ECONNRESET', true, PublishErrorKind.OUTCOME_UNKNOWN],
    ['ECONNABORTED', true, PublishErrorKind.OUTCOME_UNKNOWN],
    ['ECONNREFUSED', true, PublishErrorKind.RETRY_LATER],
    ['ENOTFOUND', true, PublishErrorKind.RETRY_LATER],
    ['EAI_AGAIN', true, PublishErrorKind.RETRY_LATER],
    ['ETIMEDOUT', false, PublishErrorKind.RETRY_LATER],
  ])(
    'reads connection error %s (publish request: %s) as %s',
    (code, isPublishRequest, kind) => {
      const error = Object.assign(new Error('network'), { code });

      expect(classifyHttpPublishError(error, { isPublishRequest }).kind).toBe(
        kind,
      );
    },
  );

  it('does not read the message to decide', () => {
    const error = Object.assign(
      new Error('rate limit exceeded, 429, timeout'),
      {
        response: { headers: {}, status: 400 },
      },
    );

    expect(
      classifyHttpPublishError(error, { isPublishRequest: true }).kind,
    ).toBe(PublishErrorKind.CONTENT_REJECTED);
  });

  it('takes the wait from a Retry-After header in seconds', () => {
    const result = classifyHttpPublishError(
      httpFailure(429, { 'retry-after': '30' }),
      { isPublishRequest: true },
    );

    expect(result.retryAfterMs).toBe(30_000);
  });

  it('leaves retryAfterMs unset when a rate limit names no wait', () => {
    const result = classifyHttpPublishError(httpFailure(429), {
      isPublishRequest: true,
    });

    expect(result.kind).toBe(PublishErrorKind.RATE_LIMITED);
    expect(result.retryAfterMs).toBeUndefined();
  });

  it('lets a provider override the kind of a status', () => {
    const result = classifyHttpPublishError(httpFailure(401), {
      isPublishRequest: true,
      kindForStatus: (status) =>
        status === 401 ? PublishErrorKind.CHANNEL_DISCONNECTED : undefined,
    });

    expect(result.kind).toBe(PublishErrorKind.CHANNEL_DISCONNECTED);
  });

  it('keeps the provider code and the original error as the cause', () => {
    const original = httpFailure(400);
    const result = classifyHttpPublishError(original, {
      isPublishRequest: true,
      providerCode: '21211',
    });

    expect(result.providerCode).toBe('21211');
    expect(result.cause).toBe(original);
  });

  it('replaces the message and drops the cause when a message is given', () => {
    const result = classifyHttpPublishError(httpFailure(500), {
      isPublishRequest: false,
      message: 'Upload failed',
    });

    expect(result.message).toBe('Upload failed');
    expect(result.cause).toBeUndefined();
  });

  it('passes a failure that already carries a kind through unchanged', () => {
    const typed = new PublishError(
      PublishErrorKind.CHANNEL_DISCONNECTED,
      'gone',
    );

    expect(classifyHttpPublishError(typed, { isPublishRequest: true })).toBe(
      typed,
    );
  });
});
