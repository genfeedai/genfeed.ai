import { describe, expect, it } from 'vitest';
import {
  getTwitterRetryAfterMs,
  isTwitterAuthorizationError,
  isTwitterOAuthCodeError,
  isTwitterRateLimitError,
  isTwitterScopeOrTierError,
  mapTwitterApiError,
  X_CREDENTIAL_ERROR,
  X_RATE_LIMIT_ERROR,
  X_TIER_LIMITATION_ERROR,
} from './twitter-api-error.util';

describe('mapTwitterApiError', () => {
  it('maps access-level and 403 failures to a tier-limitation class', () => {
    expect(
      mapTwitterApiError(new Error('403 Client Forbidden — access level')),
    ).toBe(X_TIER_LIMITATION_ERROR);
    expect(
      mapTwitterApiError({
        code: 453,
        message: 'You currently have access to a subset of X API V2 endpoints',
      }),
    ).toBe(X_TIER_LIMITATION_ERROR);
    expect(
      mapTwitterApiError({
        data: { status: 403, title: 'client-not-enrolled' },
        status: 403,
      }),
    ).toBe(X_TIER_LIMITATION_ERROR);
  });

  it('maps rate limits to a distinct class and surfaces reset timing', () => {
    expect(mapTwitterApiError(new Error('429 Too Many Requests'))).toBe(
      X_RATE_LIMIT_ERROR,
    );
    expect(
      mapTwitterApiError({
        code: 429,
        message: 'Rate limit exceeded',
        rateLimit: { reset: Date.parse('2026-08-18T00:53:20.000Z') / 1000 },
      }),
    ).toBe('X is busy. Try again after 2026-08-18T00:53:20.000Z.');
  });

  it('maps missing-credential failures separately from tier limits', () => {
    expect(
      mapTwitterApiError(new Error('401 Unauthorized — token expired')),
    ).toBe(X_CREDENTIAL_ERROR);
    expect(
      mapTwitterApiError({
        message: 'Twitter credential not found',
        status: 401,
      }),
    ).toBe(X_CREDENTIAL_ERROR);
  });

  it('keeps unknown failures readable instead of inventing a class', () => {
    expect(
      mapTwitterApiError(new Error('Tweet not found or incomplete response')),
    ).toBe('Tweet not found or incomplete response');
  });

  it('classifies 401 as authorization, 403/453 as tier, and 429 as rate-limit', () => {
    expect(isTwitterAuthorizationError({ response: { status: 401 } })).toBe(
      true,
    );
    expect(
      isTwitterAuthorizationError({
        response: { data: { title: 'client-not-enrolled' }, status: 403 },
      }),
    ).toBe(false);
    expect(
      isTwitterScopeOrTierError({
        response: { data: { title: 'client-not-enrolled' }, status: 403 },
      }),
    ).toBe(true);
    expect(isTwitterRateLimitError({ response: { status: 429 } })).toBe(true);
    expect(
      getTwitterRetryAfterMs(
        { response: { headers: { 'retry-after': '2' }, status: 429 } },
        1_000,
        5_000,
      ),
    ).toBe(2_000);
  });

  it('distinguishes callback-code failures from client configuration failures', () => {
    expect(
      isTwitterOAuthCodeError({
        data: {
          error: 'invalid_grant',
          error_description: 'The authorization code has expired',
        },
      }),
    ).toBe(true);
    expect(
      isTwitterOAuthCodeError({
        response: {
          data: {
            error: 'invalid_client',
            error_description: 'Client authentication failed',
          },
          status: 401,
        },
      }),
    ).toBe(false);
  });
});
