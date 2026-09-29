import { describe, expect, it } from 'vitest';
import {
  isRestreamAccessTokenStale,
  pickAccessTokenAfterRefresh,
  resolveRestreamAccessFromCredential,
} from './restream-token.util';

describe('restream-token.util', () => {
  const now = new Date('2026-08-12T12:00:00.000Z');

  describe('isRestreamAccessTokenStale', () => {
    it('is not stale when no expiry is recorded', () => {
      expect(isRestreamAccessTokenStale(null, now)).toBe(false);
      expect(isRestreamAccessTokenStale(undefined, now)).toBe(false);
    });
  });

  describe('resolveRestreamAccessFromCredential', () => {
    it('flags needsRefresh when access token is expired and refresh exists', () => {
      const resolved = resolveRestreamAccessFromCredential(
        {
          accessToken: 'stale-token',
          accessTokenExpiry: new Date('2026-08-12T11:00:00.000Z'),
          id: 'cred-2',
          refreshToken: 'refresh-2',
        },
        now,
      );

      expect(resolved?.needsRefresh).toBe(true);
      expect(resolved?.refreshToken).toBe('refresh-2');
      expect(resolved?.accessToken).toBe('stale-token');
    });

    it('returns null when neither access nor refresh token exists', () => {
      expect(
        resolveRestreamAccessFromCredential({
          accessToken: null,
          refreshToken: null,
        }),
      ).toBeNull();
    });

    it('requires refresh when only refresh token is present', () => {
      const resolved = resolveRestreamAccessFromCredential(
        {
          accessToken: null,
          id: 'cred-3',
          refreshToken: 'refresh-only',
        },
        now,
      );
      expect(resolved).toEqual({
        accessToken: '',
        credentialId: 'cred-3',
        needsRefresh: true,
        refreshToken: 'refresh-only',
      });
    });
  });

  describe('pickAccessTokenAfterRefresh', () => {
    it('falls back to previous access token when refresh body lacks token', () => {
      expect(pickAccessTokenAfterRefresh({}, 'old-token')).toBe('old-token');
      expect(pickAccessTokenAfterRefresh(null, '')).toBeNull();
    });
  });
});
