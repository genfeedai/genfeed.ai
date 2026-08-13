import { describe, expect, it } from 'vitest';
import {
  BETTER_AUTH_SECRET_REQUIRED_MESSAGE,
  DESKTOP_SHELL_TRUSTED_ORIGINS,
  parseCommaSeparated,
  resolveBetterAuthBaseUrl,
  resolveBetterAuthRuntimeConfig,
  resolveBooleanFlag,
  resolveCookieDomain,
  resolveExperimentalJoins,
  resolveSocialProviderConfig,
  resolveTrustedOrigins,
} from './better-auth.config';
import { BETTER_AUTH_BASE_PATH } from './better-auth.constants';

describe('Better Auth config', () => {
  it('uses the API origin as the production OAuth callback base', () => {
    const baseUrl = resolveBetterAuthBaseUrl('https://api.genfeed.ai', 3010);

    expect(`${baseUrl}${BETTER_AUTH_BASE_PATH}/callback/google`).toBe(
      'https://api.genfeed.ai/v1/auth/callback/google',
    );
  });

  it('accepts console.genfeed.ai as a trusted post-auth callback origin', () => {
    expect(
      resolveTrustedOrigins(
        'https://genfeed.ai, https://app.genfeed.ai, https://console.genfeed.ai',
        'production',
      ),
    ).toContain('https://console.genfeed.ai');
  });

  describe('resolveTrustedOrigins', () => {
    it('trusts the desktop shell and local development origins in development', () => {
      const origins = resolveTrustedOrigins(undefined, 'development');
      expect(origins).toContain(DESKTOP_SHELL_TRUSTED_ORIGINS[0]);
      expect(origins).toContain('http://genfeed.localhost:*');
      expect(origins).toContain('https://*.genfeed.localhost');
      expect(origins).toContain('http://localhost:*');
      expect(origins).toContain('http://local.genfeed.ai:*');
    });

    it('merges configured origins with the local-dev defaults and de-dupes', () => {
      const origins = resolveTrustedOrigins(
        'https://app.genfeed.ai, http://localhost:*',
        'development',
      );
      expect(origins).toContain('https://app.genfeed.ai');
      expect(origins.filter((o) => o === 'http://localhost:*')).toHaveLength(1);
    });

    it('trusts only the fixed desktop loopback origin in production and staging', () => {
      for (const env of ['production', 'staging']) {
        const origins = resolveTrustedOrigins('https://app.genfeed.ai', env);
        expect(origins).toEqual([
          'https://app.genfeed.ai',
          DESKTOP_SHELL_TRUSTED_ORIGINS[0],
        ]);
        expect(origins).not.toContain('http://localhost:*');
        expect(origins).not.toContain('http://genfeed.localhost:*');
        expect(origins).not.toContain('http://local.genfeed.ai:*');
      }
    });

    it('does not auto-trust localhost when production has no env-listed origins', () => {
      expect(resolveTrustedOrigins(undefined, 'production')).toEqual([
        DESKTOP_SHELL_TRUSTED_ORIGINS[0],
      ]);
    });
  });

  describe('parseCommaSeparated', () => {
    it('trims, splits, and drops empty entries', () => {
      expect(
        parseCommaSeparated(' x-forwarded-for , cf-connecting-ip ,'),
      ).toEqual(['x-forwarded-for', 'cf-connecting-ip']);
    });

    it('returns an empty list for unset / blank values', () => {
      expect(parseCommaSeparated(undefined)).toEqual([]);
      expect(parseCommaSeparated('')).toEqual([]);
    });
  });

  describe('resolveCookieDomain', () => {
    it('returns the trimmed root domain when set', () => {
      expect(resolveCookieDomain('  .genfeed.ai ')).toBe('.genfeed.ai');
    });

    it('returns undefined for unset / blank so the cookie stays host-scoped', () => {
      expect(resolveCookieDomain(undefined)).toBeUndefined();
      expect(resolveCookieDomain('   ')).toBeUndefined();
    });
  });

  describe('resolveExperimentalJoins', () => {
    it('enables only on the exact string "true"', () => {
      expect(resolveExperimentalJoins('true')).toBe(true);
      expect(resolveExperimentalJoins(' true ')).toBe(true);
    });

    it('stays off for any other / unset value', () => {
      expect(resolveExperimentalJoins('false')).toBe(false);
      expect(resolveExperimentalJoins(undefined)).toBe(false);
      expect(resolveExperimentalJoins('1')).toBe(false);
    });
  });

  describe('resolveBooleanFlag', () => {
    it('parses explicit boolean strings and otherwise falls back', () => {
      expect(resolveBooleanFlag('true')).toBe(true);
      expect(resolveBooleanFlag(' false ')).toBe(false);
      expect(resolveBooleanFlag(undefined, true)).toBe(true);
      expect(resolveBooleanFlag('1', false)).toBe(false);
    });
  });

  describe('resolveSocialProviderConfig', () => {
    it('returns trimmed OAuth credentials when both values are configured', () => {
      expect(
        resolveSocialProviderConfig(' google-client ', ' google-secret '),
      ).toEqual({
        clientId: 'google-client',
        clientSecret: 'google-secret',
      });
    });

    it('omits the provider when either credential is missing', () => {
      expect(resolveSocialProviderConfig('google-client', '')).toBeUndefined();
      expect(resolveSocialProviderConfig('', 'google-secret')).toBeUndefined();
      expect(resolveSocialProviderConfig(undefined, undefined)).toBeUndefined();
    });
  });

  describe('resolveBetterAuthRuntimeConfig', () => {
    it('fails closed when the signing secret is absent', () => {
      expect(() =>
        resolveBetterAuthRuntimeConfig({
          BETTER_AUTH_URL: 'https://api.genfeed.ai',
        }),
      ).toThrow(BETTER_AUTH_SECRET_REQUIRED_MESSAGE);
      expect(() =>
        resolveBetterAuthRuntimeConfig({
          BETTER_AUTH_SECRET: '',
          BETTER_AUTH_URL: 'https://api.genfeed.ai',
        }),
      ).toThrow(BETTER_AUTH_SECRET_REQUIRED_MESSAGE);
    });

    it('does not infer a cookie domain from a cloud hostname', () => {
      const runtime = resolveBetterAuthRuntimeConfig({
        BETTER_AUTH_SECRET: 'runtime-config-secret',
        BETTER_AUTH_URL: 'https://api.genfeed.ai',
        NODE_ENV: 'production',
      });

      expect(runtime.baseURL).toBe('https://api.genfeed.ai');
      expect(runtime.cookieDomain).toBeUndefined();
    });

    it('uses only BETTER_AUTH_COOKIE_DOMAIN for cloud cookie sharing', () => {
      const runtime = resolveBetterAuthRuntimeConfig({
        BETTER_AUTH_COOKIE_DOMAIN: ' .genfeed.ai ',
        BETTER_AUTH_SECRET: 'runtime-config-secret',
        BETTER_AUTH_URL: 'https://api.genfeed.ai',
        NODE_ENV: 'production',
      });

      expect(runtime.cookieDomain).toBe('.genfeed.ai');
    });

    it('auto-trusts localhost and local.genfeed.ai only outside production', () => {
      const development = resolveBetterAuthRuntimeConfig({
        BETTER_AUTH_SECRET: 'runtime-config-secret',
        NODE_ENV: 'development',
      });
      const production = resolveBetterAuthRuntimeConfig({
        BETTER_AUTH_SECRET: 'runtime-config-secret',
        BETTER_AUTH_TRUSTED_ORIGINS: 'https://app.genfeed.ai',
        NODE_ENV: 'production',
      });

      expect(development.trustedOrigins).toEqual(
        expect.arrayContaining([
          'http://localhost:*',
          'http://local.genfeed.ai:*',
        ]),
      );
      expect(production.trustedOrigins).toEqual([
        'https://app.genfeed.ai',
        DESKTOP_SHELL_TRUSTED_ORIGINS[0],
      ]);
    });
  });
});
