import {
  describeApifyError,
  getApifyErrorMessage,
  getApifyErrorStatus,
  getApifyErrorType,
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
  describe('getApifyErrorStatus', () => {
    it('reads the response status', () => {
      expect(getApifyErrorStatus(buildApifyError(403))).toBe(403);
    });

    it('returns undefined for non-axios errors', () => {
      expect(getApifyErrorStatus(new Error('boom'))).toBeUndefined();
      expect(getApifyErrorStatus(null)).toBeUndefined();
      expect(getApifyErrorStatus('nope')).toBeUndefined();
    });
  });

  describe('getApifyErrorType', () => {
    it('reads the Apify error type', () => {
      expect(
        getApifyErrorType(buildApifyError(403, 'platform-feature-disabled')),
      ).toBe('platform-feature-disabled');
    });

    it('returns undefined when the body has no typed error', () => {
      expect(getApifyErrorType(buildApifyError(500))).toBeUndefined();
    });
  });

  describe('getApifyErrorMessage', () => {
    it('prefers the Apify error message over the axios message', () => {
      expect(
        getApifyErrorMessage(
          buildApifyError(
            403,
            'platform-feature-disabled',
            'Monthly usage hard limit exceeded',
          ),
        ),
      ).toBe('Monthly usage hard limit exceeded');
    });

    it('falls back to the thrown error message', () => {
      expect(getApifyErrorMessage(new Error('socket hang up'))).toBe(
        'socket hang up',
      );
    });
  });

  describe('isApifyAccountLimitError', () => {
    it('detects the production monthly hard limit 403', () => {
      expect(
        isApifyAccountLimitError(
          buildApifyError(
            403,
            'platform-feature-disabled',
            'Monthly usage hard limit exceeded',
          ),
        ),
      ).toBe(true);
    });

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

    it('ignores a generic platform-feature-disabled without a limit message', () => {
      expect(
        isApifyAccountLimitError(
          buildApifyError(403, 'platform-feature-disabled', 'Feature disabled'),
        ),
      ).toBe(false);
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
    it('renders a compact status/type/message summary', () => {
      expect(
        describeApifyError(
          buildApifyError(
            403,
            'platform-feature-disabled',
            'Monthly usage hard limit exceeded',
          ),
        ),
      ).toBe(
        '403 platform-feature-disabled: Monthly usage hard limit exceeded',
      );
    });

    it('renders unclassified errors without inventing fields', () => {
      expect(describeApifyError(new Error('socket hang up'))).toBe(
        'socket hang up',
      );
    });
  });
});
