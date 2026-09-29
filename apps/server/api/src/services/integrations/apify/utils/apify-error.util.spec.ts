import {
  describeApifyError,
  getApifyErrorMessage,
  getApifyErrorStatus,
  getApifyErrorType,
  isAmbiguousApifyStartError,
  isApifyAccountLimitError,
  isApifyAuthorizationError,
} from '@api/services/integrations/apify/utils/apify-error.util';

function buildApifyError(
  status: number,
  type?: string,
  message?: string,
): unknown {
  return {
    isAxiosError: true,
    message: `Request failed with status code ${status}`,
    name: 'AxiosError',
    response: {
      data: type || message ? { error: { message, type } } : undefined,
      status,
    },
  };
}

describe('apify-error.util', () => {
  it('treats timeouts as ambiguous starts and 4xx as definite refusals', () => {
    expect(isAmbiguousApifyStartError(new Error('socket hang up'))).toBe(true);
    expect(isAmbiguousApifyStartError(buildApifyError(503))).toBe(true);
    expect(isAmbiguousApifyStartError(buildApifyError(400))).toBe(false);
    expect(isAmbiguousApifyStartError(buildApifyError(403))).toBe(false);
  });

  describe('getApifyErrorStatus', () => {
    it('returns undefined for non-axios errors', () => {
      expect(getApifyErrorStatus(new Error('boom'))).toBeUndefined();
      expect(getApifyErrorStatus(null)).toBeUndefined();
      expect(getApifyErrorStatus('nope')).toBeUndefined();
    });
  });

  describe('getApifyErrorType', () => {
    it('returns undefined when the body has no typed error', () => {
      expect(getApifyErrorType(buildApifyError(500))).toBeUndefined();
    });
  });

  describe('getApifyErrorMessage', () => {
    it('falls back to the thrown error message', () => {
      expect(getApifyErrorMessage(new Error('socket hang up'))).toBe(
        'socket hang up',
      );
    });
  });

  describe('isApifyAccountLimitError', () => {
    it('detects explicit usage-limit error types', () => {
      expect(
        isApifyAccountLimitError(buildApifyError(403, 'usage-limit-exceeded')),
      ).toBe(true);
      expect(
        isApifyAccountLimitError(
          buildApifyError(403, 'monthly-usage-hard-limit-exceeded'),
        ),
      ).toBe(true);
    });

    it('ignores per-actor permission and non-403 failures', () => {
      expect(
        isApifyAccountLimitError(
          buildApifyError(403, 'insufficient-permissions'),
        ),
      ).toBe(false);
      expect(
        isApifyAccountLimitError(
          buildApifyError(429, 'rate-limit-exceeded', 'Too many requests'),
        ),
      ).toBe(false);
      expect(isApifyAccountLimitError(new Error('socket hang up'))).toBe(false);
    });
  });

  describe('isApifyAuthorizationError', () => {
    it('detects missing or unknown tokens', () => {
      expect(
        isApifyAuthorizationError(buildApifyError(401, 'token-not-provided')),
      ).toBe(true);
      expect(
        isApifyAuthorizationError(
          buildApifyError(404, 'user-or-token-not-found'),
        ),
      ).toBe(true);
      expect(isApifyAuthorizationError(buildApifyError(401))).toBe(true);
    });

    it('does not classify the usage hard limit as an auth failure', () => {
      expect(
        isApifyAuthorizationError(
          buildApifyError(
            403,
            'platform-feature-disabled',
            'Monthly usage hard limit exceeded',
          ),
        ),
      ).toBe(false);
    });
  });

  describe('describeApifyError', () => {
    it('renders unclassified errors without inventing fields', () => {
      expect(describeApifyError(new Error('socket hang up'))).toBe(
        'socket hang up',
      );
    });
  });
});
