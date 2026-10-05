import { describe, expect, it } from 'vitest';
import {
  buildBrowserAuthCallbackURL,
  buildMagicLinkCallbackURL,
  isSafeBrowserAuthCallbackURL,
  readMagicLinkVerifyCallbackURL,
} from './callback';

const ORIGIN = 'https://app.genfeed.ai';
const CONSENT =
  '/oauth/consent?client_id=c1&redirect_uri=https%3A%2F%2Fclaude.ai%2Fapi%2Fmcp%2Fauth_callback&state=s1&code_challenge=x1&code_challenge_method=S256&resource=https%3A%2F%2Fmcp.genfeed.ai%2Fmcp';

/**
 * What Better Auth 1.6 does with a magic link's `callbackURL`: it is set on
 * the emailed verify URL, parsed back out of the query, then decoded once
 * more before the redirect.
 */
function followMagicLink(callbackURL: string): URL {
  const emailed = new URL('https://api.genfeed.ai/v1/auth/magic-link/verify');
  emailed.searchParams.set('callbackURL', callbackURL);
  const parsed = new URL(emailed.toString()).searchParams.get('callbackURL');
  return new URL(readMagicLinkVerifyCallbackURL(parsed ?? '') ?? '/', ORIGIN);
}

describe('buildMagicLinkCallbackURL (#6268)', () => {
  it('lands on the full continuation after the verify redirect', () => {
    const landed = followMagicLink(buildMagicLinkCallbackURL(CONSENT, ORIGIN));

    expect(landed.pathname).toBe('/');
    expect([...landed.searchParams.keys()]).toEqual(['callbackUrl']);
    expect(landed.searchParams.get('callbackUrl')).toBe(CONSENT);
  });

  it('documents the bug: the plain browser callback loses the OAuth state', () => {
    const landed = followMagicLink(
      buildBrowserAuthCallbackURL(CONSENT, ORIGIN),
    );

    expect(landed.searchParams.get('callbackUrl')).not.toBe(CONSENT);
    expect(landed.searchParams.get('state')).toBe('s1');
  });

  it('keeps simple continuations and the bare root working', () => {
    expect(
      followMagicLink(
        buildMagicLinkCallbackURL('/acme/~/settings', ORIGIN),
      ).searchParams.get('callbackUrl'),
    ).toBe('/acme/~/settings');
    expect(buildMagicLinkCallbackURL('/', ORIGIN)).toBe(`${ORIGIN}/`);
  });

  it('builds a callback the mailer accepts once decoded, and only then', () => {
    const callbackURL = buildMagicLinkCallbackURL(CONSENT, ORIGIN);

    expect(
      isSafeBrowserAuthCallbackURL(
        readMagicLinkVerifyCallbackURL(callbackURL) ?? '',
        ORIGIN,
      ),
    ).toBe(true);
    expect(
      isSafeBrowserAuthCallbackURL(
        readMagicLinkVerifyCallbackURL(
          buildBrowserAuthCallbackURL(CONSENT, ORIGIN),
        ) ?? '',
        ORIGIN,
      ),
    ).toBe(false);
  });

  it('returns null for a value the verify decode would reject', () => {
    expect(readMagicLinkVerifyCallbackURL('%E0%A4%A')).toBeNull();
  });
});
