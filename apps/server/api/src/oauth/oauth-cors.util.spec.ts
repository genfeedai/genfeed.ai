import { isPublicOAuthCorsPath } from '@api/oauth/oauth-cors.util';
import { describe, expect, it } from 'vitest';

describe('isPublicOAuthCorsPath', () => {
  it.each([
    '/v1/oauth/register',
    '/v1/oauth/token',
    '/v1/oauth/revoke',
    '/v1/oauth/token/',
    '/v1/oauth/token?grant_type=refresh_token',
  ])('treats %s as a public OAuth endpoint', (url) => {
    expect(isPublicOAuthCorsPath(url)).toBe(true);
  });

  it.each([
    undefined,
    '',
    '/v1/oauth/authorize',
    '/v1/oauth/authorize/decision',
    '/v1/oauth/register-evil',
    '/v1/oauth/token/extra',
    '/oauth/token',
    '/v1/users/me',
  ])('keeps %s on the credentialed allowlist', (url) => {
    expect(isPublicOAuthCorsPath(url)).toBe(false);
  });
});
