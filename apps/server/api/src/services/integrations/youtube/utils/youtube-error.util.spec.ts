import {
  getYoutubeErrorCode,
  getYoutubeRetryAfterMs,
  isYoutubeAuthorizationError,
  isYoutubeChannelSelectionError,
  isYoutubeRateLimitError,
  isYoutubeScopeError,
} from '@api/services/integrations/youtube/utils/youtube-error.util';

function apiError(
  code: number,
  reason: string,
  message = 'error',
  status = code,
  retryAfter?: string,
) {
  return {
    response: {
      data: {
        error: {
          code,
          errors: [{ message, reason }],
          message,
        },
      },
      headers: retryAfter === undefined ? {} : { 'retry-after': retryAfter },
      status,
    },
  };
}

describe('YouTube error utilities', () => {
  it.each([undefined, null])(
    'treats an absent provider error (%s) as unclassified',
    (error) => {
      expect(getYoutubeErrorCode(error)).toBeUndefined();
      expect(isYoutubeAuthorizationError(error)).toBe(false);
      expect(isYoutubeScopeError(error)).toBe(false);
      expect(isYoutubeRateLimitError(error)).toBe(false);
      expect(isYoutubeChannelSelectionError(error)).toBe(false);
      expect(getYoutubeRetryAfterMs(error, 1_000, 5_000)).toBe(1_000);
    },
  );

  it('classifies revoked tokens separately from missing permissions', () => {
    expect(
      isYoutubeAuthorizationError(
        apiError(401, 'authError', 'Invalid Credentials', 401),
      ),
    ).toBe(true);
    expect(
      isYoutubeAuthorizationError({
        response: { data: { error: 'invalid_grant' }, status: 400 },
      }),
    ).toBe(true);
    expect(
      isYoutubeScopeError(
        apiError(403, 'insufficientPermissions', 'Permission denied'),
      ),
    ).toBe(true);
    expect(
      isYoutubeAuthorizationError(
        apiError(403, 'insufficientPermissions', 'Permission denied'),
      ),
    ).toBe(false);
  });

  it('classifies missing brand-account channel selection as a dedicated state', () => {
    const error = apiError(
      401,
      'youtubeSignupRequired',
      'The user has a Google Account but does not have a YouTube channel',
    );

    expect(isYoutubeChannelSelectionError(error)).toBe(true);
    expect(isYoutubeScopeError(error)).toBe(false);
  });

  it('classifies rate limits and bounds provider retry instructions', () => {
    const error = apiError(
      403,
      'quotaExceeded',
      'The request cannot be completed because you have exceeded your quota',
      403,
      '30',
    );

    expect(isYoutubeRateLimitError(error)).toBe(true);
    expect(isYoutubeScopeError(error)).toBe(false);
    expect(getYoutubeRetryAfterMs(error, 1_000, 5_000)).toBe(5_000);
  });
});
