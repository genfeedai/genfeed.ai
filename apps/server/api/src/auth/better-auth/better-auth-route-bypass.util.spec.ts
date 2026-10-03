import { describe, expect, it } from 'vitest';
import {
  isBetterAuthAdminPath,
  shouldBypassBetterAuthHandler,
} from './better-auth-route-bypass.util';

describe('shouldBypassBetterAuthHandler', () => {
  it.each([
    ['GET', '/bootstrap'],
    ['GET', '/bootstrap/overview'],
    ['GET', '/whoami'],
    ['HEAD', '/bootstrap'],
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
    ['POST', '/request-password-reset'],
    ['POST', '/reset-password'],
    ['GET', '/reset-password/token_123'],
    ['GET', '/callback/google'],
    ['POST', '/bootstrap'],
    ['GET', '/desktop/exchange'],
    // Retired in favour of the PKCE desktop/CLI exchange.
    ['POST', '/cli/token'],
  ])('keeps Better Auth route ownership for %s %s', (method, path) => {
    expect(shouldBypassBetterAuthHandler(method, path)).toBe(false);
  });
});

describe('isBetterAuthAdminPath', () => {
  it.each([
    '/admin',
    '/admin/impersonate-user',
    '/admin/set-role/',
    '//admin//impersonate-user',
    '/ADMIN/Impersonate-User',
    'admin/list-users?limit=1',
  ])('treats %s as an admin plugin path', (path) => {
    expect(isBetterAuthAdminPath(path)).toBe(true);
  });

  it.each(['/session', '/administrator', '/sign-in/magic-link', '/'])(
    'leaves %s alone',
    (path) => {
      expect(isBetterAuthAdminPath(path)).toBe(false);
    },
  );
});
