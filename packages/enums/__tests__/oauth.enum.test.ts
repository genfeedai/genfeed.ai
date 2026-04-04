import { describe, expect, it } from 'vitest';
import { OAuthGrantType } from '../src/oauth.enum';

describe('oauth.enum', () => {
  describe('OAuthGrantType', () => {
    it('should have 5 members', () => {
      expect(Object.values(OAuthGrantType)).toHaveLength(5);
    });

    it('should have correct values', () => {
      expect(OAuthGrantType.AUTHORIZATION_CODE).toBe('authorization_code');
      expect(OAuthGrantType.REFRESH_TOKEN).toBe('refresh_token');
      expect(OAuthGrantType.FB_EXCHANGE_TOKEN).toBe('fb_exchange_token');
      expect(OAuthGrantType.TH_REFRESH_TOKEN).toBe('th_refresh_token');
      expect(OAuthGrantType.TH_EXCHANGE_TOKEN).toBe('th_exchange_token');
    });
  });
});
