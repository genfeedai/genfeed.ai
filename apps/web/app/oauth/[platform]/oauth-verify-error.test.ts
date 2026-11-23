import { describe, expect, it } from 'vitest';
import {
  isReportableOAuthVerifyFailure,
  resolveOAuthPlatformVerifyFailure,
} from './oauth-verify-error';

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

describe('resolveOAuthPlatformVerifyFailure for Google Business', () => {
  const failure = (status: string, detail: string) => ({
    errors: [{ detail, status }],
  });
  const resolve = (error: unknown, platform = 'google-business') =>
    resolveOAuthPlatformVerifyFailure({
      callbackSubmitted: true,
      error,
      platform,
      providerError: null,
    });

  it('shows the server wording when the account manages no locations and offers a new connect', () => {
    expect(
      resolve(
        failure(
          '400',
          'This Google account manages no business locations. Connect the account that owns or manages your Business Profile.',
        ),
      ),
    ).toEqual({
      canRestart: true,
      canRetry: false,
      detail:
        'This Google account manages no business locations. Connect the account that owns or manages your Business Profile.',
      messageKey: 'error.description',
      titleKey: 'error.title',
    });
  });

  it('says Google Business is not ready and offers no new connect when Business Profile access is not approved', () => {
    expect(
      resolve(failure('503', 'Business Profile API access must be approved.')),
    ).toEqual({
      canRestart: false,
      canRetry: false,
      detail: 'Business Profile API access must be approved.',
      messageKey: 'error.description',
      titleKey: 'error.googleBusinessNotReadyTitle',
    });
  });

  it('keeps the generic failure when the server gave no wording', () => {
    expect(resolve(new Error('network'))).toEqual({
      canRestart: true,
      canRetry: false,
      messageKey: 'error.description',
      titleKey: 'error.title',
    });
  });

  it('leaves other platforms on their own copy', () => {
    expect(resolve(failure('400', 'Some wording'), 'twitter')).toEqual({
      canRestart: false,
      canRetry: false,
      messageKey: 'error.description',
      titleKey: 'error.title',
    });
  });
});
