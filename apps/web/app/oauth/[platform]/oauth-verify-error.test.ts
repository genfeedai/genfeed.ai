import { describe, expect, it } from 'vitest';
import { isReportableOAuthVerifyFailure } from './oauth-verify-error';

describe('isReportableOAuthVerifyFailure', () => {
  it.each([
    ['a rejected authorization', 400],
    ['an expired session', 401],
    ['a forbidden account', 403],
    ['a missing credential', 404],
  ])('does not report %s (%i)', (_label, status) => {
    expect(isReportableOAuthVerifyFailure({ response: { status } })).toBe(
      false,
    );
  });

  it.each([
    ['rate limiting', 429],
    ['a server failure', 500],
    ['an unavailable upstream', 503],
  ])('reports %s (%i)', (_label, status) => {
    expect(isReportableOAuthVerifyFailure({ response: { status } })).toBe(true);
  });

  it('reads the status of a JSON:API document', () => {
    expect(
      isReportableOAuthVerifyFailure({
        errors: [{ code: 'youtube_state_invalid', status: '400' }],
      }),
    ).toBe(false);
  });

  it('reports a failure with no status', () => {
    expect(isReportableOAuthVerifyFailure(new Error('verify failed'))).toBe(
      true,
    );
  });
});
