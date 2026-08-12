import {
  getTikTokErrorCode,
  getTikTokRetryAfterMs,
  isTikTokAuthorizationError,
  isTikTokRateLimitError,
  isTikTokScopeError,
} from '@api/services/integrations/tiktok/utils/tiktok-error.util';

describe('TikTok error utilities', () => {
  it.each([undefined, null])(
    'treats an absent provider error (%s) as unclassified',
    (error) => {
      expect(getTikTokErrorCode(error)).toBeUndefined();
      expect(isTikTokAuthorizationError(error)).toBe(false);
      expect(isTikTokScopeError(error)).toBe(false);
      expect(isTikTokRateLimitError(error)).toBe(false);
      expect(getTikTokRetryAfterMs(error, 1_000, 5_000)).toBe(1_000);
    },
  );

  it('reads top-level and nested TikTok error codes', () => {
    expect(
      getTikTokErrorCode({
        response: { data: { error: { code: 'scope_not_authorized' } } },
      }),
    ).toBe('scope_not_authorized');
    expect(
      getTikTokErrorCode({
        response: {
          data: { data: { error: { code: 'access_token_invalid' } } },
        },
      }),
    ).toBe('access_token_invalid');
  });

  it('ignores a malformed null provider error payload', () => {
    expect(
      getTikTokErrorCode({ response: { data: { error: null } } }),
    ).toBeUndefined();
  });

  it('classifies rate limits and bounds provider retry instructions', () => {
    const error = {
      response: {
        data: { error: { code: 'rate_limit_exceeded' } },
        headers: { 'retry-after': '30' },
        status: 429,
      },
    };

    expect(isTikTokRateLimitError(error)).toBe(true);
    expect(getTikTokRetryAfterMs(error, 1_000, 5_000)).toBe(5_000);
  });
});
