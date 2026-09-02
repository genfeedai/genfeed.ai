import {
  getInstagramErrorCode,
  getInstagramRetryAfterMs,
  isInstagramAuthorizationError,
  isInstagramProfessionalAccountError,
  isInstagramRateLimitError,
  isInstagramScopeError,
} from '@api/services/integrations/instagram/utils/instagram-error.util';

function graphError(
  code: number,
  message = 'error',
  status = 400,
  retryAfter?: string,
) {
  return {
    response: {
      data: { error: { code, message } },
      headers: retryAfter === undefined ? {} : { 'retry-after': retryAfter },
      status,
    },
  };
}

describe('Instagram error utilities', () => {
  it.each([undefined, null])(
    'treats an absent provider error (%s) as unclassified',
    (error) => {
      expect(getInstagramErrorCode(error)).toBeUndefined();
      expect(isInstagramAuthorizationError(error)).toBe(false);
      expect(isInstagramScopeError(error)).toBe(false);
      expect(isInstagramRateLimitError(error)).toBe(false);
      expect(isInstagramProfessionalAccountError(error)).toBe(false);
      expect(getInstagramRetryAfterMs(error, 1_000, 5_000)).toBe(1_000);
    },
  );

  it('classifies revoked tokens separately from missing permissions', () => {
    expect(isInstagramAuthorizationError(graphError(190))).toBe(true);
    expect(isInstagramAuthorizationError(graphError(102))).toBe(true);
    expect(isInstagramScopeError(graphError(190))).toBe(false);
    expect(isInstagramScopeError(graphError(10, 'Permission denied'))).toBe(
      true,
    );
    expect(isInstagramAuthorizationError(graphError(10))).toBe(false);
  });

  it('classifies professional-account limitations as a dedicated state', () => {
    const error = graphError(
      10,
      'The Instagram account must be a professional account',
    );

    expect(isInstagramProfessionalAccountError(error)).toBe(true);
    expect(isInstagramScopeError(error)).toBe(false);
    expect(isInstagramAuthorizationError(error)).toBe(false);
  });

  it('classifies rate limits and bounds provider retry instructions', () => {
    const error = graphError(17, 'User request limit reached', 429, '30');

    expect(isInstagramRateLimitError(error)).toBe(true);
    expect(getInstagramRetryAfterMs(error, 1_000, 5_000)).toBe(5_000);
  });
});
