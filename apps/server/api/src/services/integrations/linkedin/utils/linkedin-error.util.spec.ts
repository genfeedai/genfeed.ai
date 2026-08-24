import {
  getLinkedinErrorCode,
  getLinkedinRetryAfterMs,
  isLinkedinAuthorizationError,
  isLinkedinOrganizationSelectionError,
  isLinkedinRateLimitError,
  isLinkedinScopeError,
} from '@api/services/integrations/linkedin/utils/linkedin-error.util';

function apiError(
  status: number,
  message = 'error',
  retryAfter?: string,
  extra: Record<string, unknown> = {},
) {
  return {
    response: {
      data: {
        message,
        status,
        ...extra,
      },
      headers: retryAfter === undefined ? {} : { 'retry-after': retryAfter },
      status,
    },
  };
}

describe('LinkedIn error utilities', () => {
  it.each([undefined, null])(
    'treats an absent provider error (%s) as unclassified',
    (error) => {
      expect(getLinkedinErrorCode(error)).toBeUndefined();
      expect(isLinkedinAuthorizationError(error)).toBe(false);
      expect(isLinkedinScopeError(error)).toBe(false);
      expect(isLinkedinRateLimitError(error)).toBe(false);
      expect(isLinkedinOrganizationSelectionError(error)).toBe(false);
      expect(getLinkedinRetryAfterMs(error, 1_000, 5_000)).toBe(1_000);
    },
  );

  it('classifies revoked tokens separately from missing permissions', () => {
    expect(
      isLinkedinAuthorizationError(
        apiError(401, 'The token used in the request has been revoked'),
      ),
    ).toBe(true);
    expect(
      isLinkedinScopeError(
        apiError(403, 'Not enough permissions to access this resource'),
      ),
    ).toBe(true);
    expect(
      isLinkedinAuthorizationError(
        apiError(403, 'Not enough permissions to access this resource'),
      ),
    ).toBe(false);
  });

  it('classifies organization page selection separately from missing scopes', () => {
    expect(
      isLinkedinOrganizationSelectionError(
        apiError(400, 'No organization ACL found for this company page'),
      ),
    ).toBe(true);
    expect(
      isLinkedinScopeError(
        apiError(400, 'No organization ACL found for this company page'),
      ),
    ).toBe(false);
  });

  it('honors Retry-After on rate limits and falls back otherwise', () => {
    expect(
      isLinkedinRateLimitError(apiError(429, 'Throttle limit for calls', '2')),
    ).toBe(true);
    expect(
      getLinkedinRetryAfterMs(
        apiError(429, 'Throttle limit for calls', '2'),
        1_000,
        5_000,
      ),
    ).toBe(2_000);
    expect(
      getLinkedinRetryAfterMs(
        apiError(429, 'Throttle limit for calls'),
        1_000,
        5_000,
      ),
    ).toBe(1_000);
  });
});
