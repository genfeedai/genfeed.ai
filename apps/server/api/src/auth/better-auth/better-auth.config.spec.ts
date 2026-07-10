import { describe, expect, it } from 'vitest';
import {
  parseCommaSeparated,
  parseTrustedOrigins,
  resolveBetterAuthBaseUrl,
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
      parseTrustedOrigins(
        'https://genfeed.ai, https://app.genfeed.ai, https://console.genfeed.ai',
      ),
    ).toContain('https://console.genfeed.ai');
  });

  describe('resolveTrustedOrigins', () => {
    it('auto-trusts localhost AND local.genfeed.ai for local dev (no env needed)', () => {
      const origins = resolveTrustedOrigins(undefined, 'development');
      expect(origins).toContain('http://localhost:3000');
      expect(origins).toContain('http://local.genfeed.ai:3000');
    });

    it('merges configured origins with the local-dev defaults and de-dupes', () => {
      const origins = resolveTrustedOrigins(
        'https://app.genfeed.ai, http://localhost:3000',
        'development',
      );
      expect(origins).toContain('https://app.genfeed.ai');
      expect(origins.filter((o) => o === 'http://localhost:3000')).toHaveLength(
        1,
      );
    });

    it('never auto-trusts localhost in production or staging', () => {
      for (const env of ['production', 'staging']) {
        const origins = resolveTrustedOrigins('https://app.genfeed.ai', env);
        expect(origins).toEqual(['https://app.genfeed.ai']);
        expect(origins).not.toContain('http://localhost:3000');
      }
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
});
