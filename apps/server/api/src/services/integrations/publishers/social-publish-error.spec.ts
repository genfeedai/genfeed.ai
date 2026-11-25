import { toPublishError } from '@api/services/integrations/publishers/publish-error.util';
import {
  mapMastodonFailure,
  mapMetaFailure,
  mapXFailure,
} from '@api/services/integrations/publishers/social-publish-error.mappers';
import { PublishErrorKind } from '@genfeedai/contracts';
import { isPublishError, PublishError } from '@genfeedai/contracts/interfaces';
import { IntegrationHttpError } from '@genfeedai/integrations';
import { describe, expect, it } from 'vitest';

function axiosError(
  status: number | undefined,
  data?: unknown,
  headers: Record<string, string> = {},
): Error {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: status === undefined ? undefined : { data, headers, status },
  });
}

function graphError(
  status: number,
  code: number,
  subcode?: number,
  extra: Record<string, unknown> = {},
): Error {
  return axiosError(status, {
    error: {
      code,
      error_subcode: subcode,
      message: `Graph said ${code}`,
      type: 'OAuthException',
      ...extra,
    },
  });
}

function networkError(code: string): Error {
  return Object.assign(new Error(code), { code, isAxiosError: true });
}

function xError(
  status: number,
  data: Record<string, unknown> = {},
  extra: Record<string, unknown> = {},
): Error {
  return Object.assign(new Error(`Request failed with code ${status}`), {
    code: status,
    data,
    name: 'ApiResponseError',
    ...extra,
  });
}

function toMetaPublishError(error: unknown): unknown {
  return toPublishError(error, mapMetaFailure) ?? error;
}

function toMastodonPublishError(error: unknown): unknown {
  return toPublishError(error, mapMastodonFailure) ?? error;
}

function toLinkedInPublishError(error: unknown): unknown {
  return toPublishError(error) ?? error;
}

function toTwitterPublishError(error: unknown): unknown {
  return toPublishError(error, (failure) => mapXFailure(failure)) ?? error;
}

describe('toMetaPublishError', () => {
  it.each([
    ['an expired token', graphError(401, 190, 463), 'token_must_refresh'],
    ['a token with no subcode', graphError(400, 190), 'token_must_refresh'],
    ['an invalid session', graphError(400, 102), 'token_must_refresh'],
    [
      'an app that was removed',
      graphError(400, 190, 458),
      'channel_disconnected',
    ],
    ['a changed password', graphError(400, 190, 460), 'channel_disconnected'],
    ['a missing Page role', graphError(400, 190, 492), 'channel_disconnected'],
    [
      'a permission that was removed',
      graphError(403, 200),
      'channel_disconnected',
    ],
    ['a denied permission', graphError(403, 10), 'channel_disconnected'],
    ['user throttling', graphError(400, 17), 'rate_limited'],
    ['app throttling', graphError(400, 4), 'rate_limited'],
    ['a Page request limit', graphError(400, 32), 'rate_limited'],
    ['a business use case limit', graphError(400, 80001), 'rate_limited'],
    ['a temporary policy block', graphError(400, 368), 'retry_later'],
    ['a Meta outage', graphError(500, 2), 'outcome_unknown'],
    ['an unknown Meta fault', graphError(500, 1), 'outcome_unknown'],
    ['a duplicate post', graphError(400, 506), 'content_rejected'],
    ['an invalid parameter', graphError(400, 100), 'content_rejected'],
    [
      'an account the token can no longer reach',
      graphError(400, 100, 33),
      'channel_disconnected',
    ],
    [
      'the Instagram daily publishing limit',
      graphError(400, 9, 2207042),
      'rate_limited',
    ],
    [
      'the Instagram spam restriction, whose code is a throttling code',
      graphError(400, 4, 2207051),
      'content_rejected',
    ],
    [
      'a restricted Instagram account',
      graphError(400, 25, 2207050),
      'channel_disconnected',
    ],
    [
      'an Instagram container that is not ready',
      graphError(400, 9007, 2207027),
      'retry_later',
    ],
    [
      'an Instagram server error',
      graphError(400, -1, 2207001),
      'outcome_unknown',
    ],
    [
      'a transient error with an unlisted code',
      graphError(400, 9999, undefined, { is_transient: true }),
      'outcome_unknown',
    ],
    ['an unlisted 400', graphError(400, 9999), 'content_rejected'],
    ['a 500 with no body', axiosError(500), 'outcome_unknown'],
    ['a 401 with no body', axiosError(401), 'token_must_refresh'],
    ['a timeout', networkError('ECONNABORTED'), 'outcome_unknown'],
    ['a dropped connection', networkError('ECONNRESET'), 'outcome_unknown'],
    ['a refused connection', networkError('ECONNREFUSED'), 'retry_later'],
    ['a DNS failure', networkError('ENOTFOUND'), 'retry_later'],
  ])('maps %s to %s', (_name, error, kind) => {
    expect(toMetaPublishError(error)).toMatchObject({ kind });
  });

  it('keeps the original error, the status and the Graph message', () => {
    const original = graphError(400, 506);

    const converted = toMetaPublishError(original);

    expect(converted).toBeInstanceOf(PublishError);
    expect(converted).toMatchObject({
      cause: original,
      httpStatus: 400,
      message: 'Request failed with status code 400 - Graph said 506',
      providerCode: '506',
    });
  });

  it('reads how long to wait from the business use case header', () => {
    const error = axiosError(
      400,
      { error: { code: 80001 } },
      {
        'x-business-use-case': JSON.stringify({
          '123': [{ estimated_time_to_regain_access: 5, type: 'pages' }],
          '456': [{ estimated_time_to_regain_access: 19, type: 'pages' }],
        }),
      },
    );

    expect(toMetaPublishError(error)).toMatchObject({
      kind: PublishErrorKind.RATE_LIMITED,
      retryAfterMs: 19 * 60_000,
    });
  });

  it('leaves errors the publisher raised itself as they were', () => {
    const missingCredential = new Error('Instagram credential is missing x');
    const alreadyTyped = new PublishError(
      PublishErrorKind.CONTENT_REJECTED,
      'x',
    );

    expect(toMetaPublishError(missingCredential)).toBe(missingCredential);
    expect(toMetaPublishError(alreadyTyped)).toBe(alreadyTyped);
  });
});

describe('toMastodonPublishError', () => {
  it.each([
    [
      'an invalid token',
      axiosError(401, { error: 'The access token is invalid' }),
      'channel_disconnected',
    ],
    [
      'a forbidden action',
      axiosError(403, { error: 'This action is not allowed' }),
      'channel_disconnected',
    ],
    [
      'a failed validation',
      axiosError(422, { error: 'Validation failed' }),
      'content_rejected',
    ],
    ['a rate limit', axiosError(429, {}), 'rate_limited'],
    ['an overloaded instance', axiosError(503, {}), 'outcome_unknown'],
    ['a timeout', networkError('ETIMEDOUT'), 'outcome_unknown'],
    ['a refused connection', networkError('ECONNREFUSED'), 'retry_later'],
  ])('maps %s to %s', (_name, error, kind) => {
    expect(toMastodonPublishError(error)).toMatchObject({ kind });
  });

  it('carries the instance reset time and its message', () => {
    const error = axiosError(
      429,
      { error: 'Too many requests' },
      { 'x-ratelimit-reset': '2026-11-16T09:30:00.000Z' },
    );

    expect(toMastodonPublishError(error)).toMatchObject({
      kind: PublishErrorKind.RATE_LIMITED,
      message: 'Request failed with status code 429 - Too many requests',
      resetAt: new Date('2026-11-16T09:30:00.000Z'),
    });
  });

  it('leaves errors the publisher raised itself as they were', () => {
    const error = new Error('Mastodon instance URL not found on credential');

    expect(toMastodonPublishError(error)).toBe(error);
  });
});

describe('toLinkedInPublishError', () => {
  function linkedInError(status: number): IntegrationHttpError {
    return new IntegrationHttpError('Integration request failed', {
      method: 'POST',
      status,
      url: 'https://api.linkedin.com/rest/posts',
    });
  }

  it.each([
    ['an expired token', 401, 'token_must_refresh'],
    ['a token without permission', 403, 'channel_disconnected'],
    ['a throttle', 429, 'rate_limited'],
    ['an unprocessable post', 422, 'content_rejected'],
    ['a LinkedIn fault', 500, 'outcome_unknown'],
    ['a gateway timeout', 504, 'outcome_unknown'],
  ])('maps %s to %s', (_name, status, kind) => {
    expect(toLinkedInPublishError(linkedInError(status))).toMatchObject({
      httpStatus: status,
      kind,
    });
  });

  it('maps a fetch that timed out to an unknown outcome', () => {
    const timeout = Object.assign(new Error('aborted'), { name: 'AbortError' });

    expect(toLinkedInPublishError(timeout)).toMatchObject({
      kind: PublishErrorKind.OUTCOME_UNKNOWN,
    });
  });

  it('leaves errors the publisher raised itself as they were', () => {
    const error = new Error('LinkedIn credential not found');

    expect(toLinkedInPublishError(error)).toBe(error);
  });
});

describe('toTwitterPublishError', () => {
  it.each([
    ['an expired token', xError(401), 'token_must_refresh'],
    [
      'an app that is not enrolled',
      xError(403, { type: 'https://api.x.com/2/problems/client-forbidden' }),
      'channel_disconnected',
    ],
    [
      'duplicate content',
      xError(403, {
        detail: 'You are not allowed to create a Tweet with duplicate content.',
        title: 'Forbidden',
        type: 'about:blank',
      }),
      'content_rejected',
    ],
    ['an invalid request', xError(400), 'content_rejected'],
    ['a rate limit', xError(429), 'rate_limited'],
    [
      'a usage cap',
      xError(429, { type: 'https://api.x.com/2/problems/usage-capped' }),
      'retry_later',
    ],
    [
      'depleted credits',
      xError(402, { title: 'CreditsDepleted' }),
      'provider_credits_depleted',
    ],
    ['an X fault', xError(503), 'outcome_unknown'],
    [
      'a request that never got an answer',
      Object.assign(new Error('Request failed'), { name: 'ApiRequestError' }),
      'outcome_unknown',
    ],
    [
      'a timed out request',
      Object.assign(new Error('Request failed'), {
        name: 'ApiRequestError',
        requestError: { code: 'ETIMEDOUT' },
      }),
      'outcome_unknown',
    ],
  ])('maps %s to %s', (_name, error, kind) => {
    expect(toTwitterPublishError(error)).toMatchObject({ kind });
  });

  it('carries the reset time X gave with a rate limit', () => {
    const error = xError(429, {}, { rateLimit: { reset: 1_800_000_000 } });

    expect(toTwitterPublishError(error)).toMatchObject({
      kind: PublishErrorKind.RATE_LIMITED,
      resetAt: new Date(1_800_000_000_000),
    });
  });

  it('keeps the reason X returned when the SDK message omits it', () => {
    const error = xError(403, {
      detail: 'You are not allowed to create a Tweet with duplicate content.',
      title: 'Forbidden',
    });

    expect(toTwitterPublishError(error)).toMatchObject({
      cause: error,
      httpStatus: 403,
      message:
        'Request failed with code 403 - You are not allowed to create a Tweet with duplicate content.',
    });
  });

  it('marks a duplicate-content refusal so it is not retried or reported as a fault', () => {
    const error = xError(403, {
      detail: 'You are not allowed to create a Tweet with duplicate content.',
      title: 'Forbidden',
      type: 'about:blank',
    });

    expect(toTwitterPublishError(error)).toMatchObject({
      kind: PublishErrorKind.CONTENT_REJECTED,
      providerCode: 'duplicate_content',
    });
  });

  it('leaves another 403 without the duplicate-content code', () => {
    const error = xError(403, { detail: 'Forbidden', title: 'Forbidden' });

    expect(toTwitterPublishError(error)).toMatchObject({
      kind: PublishErrorKind.CONTENT_REJECTED,
      providerCode: undefined,
    });
  });

  it('names an out-of-credits account in the message', () => {
    const error = xError(402, {
      detail: 'No credits.',
      title: 'CreditsDepleted',
    });

    expect(toTwitterPublishError(error)).toMatchObject({
      message: expect.stringContaining('X API credits depleted'),
    });
  });

  it('leaves errors the publisher raised itself as they were', () => {
    const error = new Error('Twitter credential not found or invalid');

    expect(toTwitterPublishError(error)).toBe(error);
    expect(isPublishError(toTwitterPublishError(error))).toBe(false);
  });
});
