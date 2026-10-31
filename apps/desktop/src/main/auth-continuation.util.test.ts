import { describe, expect, it } from 'bun:test';
import { resolveDesktopAuthLandingUrl } from './auth-continuation.util';

const ORIGIN = 'http://127.0.0.1:4310';

describe('resolveDesktopAuthLandingUrl (#6276)', () => {
  it('returns to the OAuth consent request that started the sign-in', () => {
    const consent =
      '/oauth/consent?client_id=c1&state=s1&code_challenge=x1&code_challenge_method=S256';

    expect(resolveDesktopAuthLandingUrl(ORIGIN, consent)).toBe(
      `${ORIGIN}${consent}`,
    );
  });

  it('falls back to the app root without a continuation', () => {
    expect(resolveDesktopAuthLandingUrl(ORIGIN)).toBe(`${ORIGIN}/`);
    expect(resolveDesktopAuthLandingUrl(ORIGIN, null)).toBe(`${ORIGIN}/`);
  });

  it.each([
    'https://evil.example/steal',
    '//evil.example/steal',
    '/\\evil.example/steal',
    'javascript:alert(1)',
    '/api/version',
  ])('refuses %s', (continuation) => {
    expect(resolveDesktopAuthLandingUrl(ORIGIN, continuation)).toBe(
      `${ORIGIN}/`,
    );
  });
});
