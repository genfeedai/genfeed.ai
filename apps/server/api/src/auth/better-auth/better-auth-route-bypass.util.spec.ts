import { describe, expect, it } from 'vitest';
import { shouldBypassBetterAuthHandler } from './better-auth-route-bypass.util';

describe('shouldBypassBetterAuthHandler', () => {
  it.each([
    ['GET', '/bootstrap'],
    ['GET', '/bootstrap/overview'],
    ['GET', '/whoami'],
    ['HEAD', '/bootstrap'],
    ['POST', '/cli/token'],
    ['POST', '/desktop/authorize'],
    ['POST', '/desktop/exchange'],
  ])('bypasses legacy Nest auth route %s %s', (method, path) => {
    expect(shouldBypassBetterAuthHandler(method, path)).toBe(true);
  });

  it('normalizes trailing slashes and query strings', () => {
    expect(
      shouldBypassBetterAuthHandler('GET', '/bootstrap/overview/?fresh=1'),
    ).toBe(true);
  });

  it.each([
    ['GET', '/session'],
    ['GET', '/token'],
    ['GET', '/jwks'],
    ['POST', '/sign-in/magic-link'],
    ['GET', '/callback/google'],
    ['POST', '/bootstrap'],
    ['GET', '/desktop/exchange'],
  ])('keeps Better Auth route ownership for %s %s', (method, path) => {
    expect(shouldBypassBetterAuthHandler(method, path)).toBe(false);
  });
});
