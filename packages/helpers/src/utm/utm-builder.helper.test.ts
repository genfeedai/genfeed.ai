import {
  addUTMParameters,
  buildUTMParameters,
  getLinkType,
} from '@helpers/utm/utm-builder.helper';
import { describe, expect, it } from 'vitest';

describe('UTM Builder Helper', () => {
  describe('getLinkType', () => {
    it('should identify YouTube links', () => {
      expect(getLinkType('https://youtube.com/@user')).toBe('social_youtube');
      expect(getLinkType('https://youtu.be/abc123')).toBe('social_youtube');
    });

    it('should identify TikTok links', () => {
      expect(getLinkType('https://tiktok.com/@user')).toBe('social_tiktok');
    });

    it('should identify Instagram links', () => {
      expect(getLinkType('https://instagram.com/user')).toBe(
        'social_instagram',
      );
    });

    it('should identify Twitter/X links', () => {
      expect(getLinkType('https://twitter.com/user')).toBe('social_twitter');
      expect(getLinkType('https://x.com/user')).toBe('social_twitter');
    });

    it('should identify LinkedIn links', () => {
      expect(getLinkType('https://linkedin.com/in/user')).toBe(
        'social_linkedin',
      );
    });

    it('should identify Calendly links', () => {
      expect(getLinkType('https://calendly.com/user')).toBe(
        'integration_calendly',
      );
    });

    it('should default to custom_link for unknown domains', () => {
      expect(getLinkType('https://example.com')).toBe('custom_link');
      expect(getLinkType('https://mybusiness.com/contact')).toBe('custom_link');
    });

    it('should handle invalid URLs gracefully', () => {
      expect(getLinkType('not-a-url')).toBe('custom_link');
      expect(getLinkType('')).toBe('custom_link');
    });
  });

  describe('addUTMParameters', () => {
    const username = 'testuser';

    it('should add UTM parameters to a basic URL', () => {
      const url = 'https://example.com';
      const result = addUTMParameters(url, username);

      expect(result).toContain('utm_source=genfeedai_profile');
      expect(result).toContain('utm_medium=profile_link');
      expect(result).toContain('utm_campaign=testuser');
      expect(result).toContain('utm_content=custom_link');
    });

    it('should preserve existing query parameters', () => {
      const url = 'https://example.com?foo=bar&baz=qux';
      const result = addUTMParameters(url, username);

      expect(result).toContain('foo=bar');
      expect(result).toContain('baz=qux');
      expect(result).toContain('utm_source=genfeedai_profile');
    });

    it('should not duplicate UTM parameters if they already exist', () => {
      const url = 'https://example.com?utm_source=existing';
      const result = addUTMParameters(url, username);

      expect(result).toBe(url);
      expect(result).not.toContain('genfeedai_profile');
    });

    it('should preserve hash fragments', () => {
      const url = 'https://example.com#section';
      const result = addUTMParameters(url, username);

      expect(result).toContain('#section');
      expect(result).toContain('utm_source=genfeedai_profile');
    });

    it('should handle URLs with both query params and hash', () => {
      const url = 'https://example.com?foo=bar#section';
      const result = addUTMParameters(url, username);

      expect(result).toContain('foo=bar');
      expect(result).toContain('#section');
      expect(result).toContain('utm_source=genfeedai_profile');
    });

    it('should auto-detect social media link types', () => {
      const youtubeResult = addUTMParameters(
        'https://youtube.com/@user',
        username,
      );
      expect(youtubeResult).toContain('utm_content=social_youtube');

      const tiktokResult = addUTMParameters(
        'https://tiktok.com/@user',
        username,
      );
      expect(tiktokResult).toContain('utm_content=social_tiktok');

      const calendlyResult = addUTMParameters(
        'https://calendly.com/user',
        username,
      );
      expect(calendlyResult).toContain('utm_content=integration_calendly');
    });

    it('should allow custom link type override', () => {
      const url = 'https://example.com';
      const result = addUTMParameters(url, username, 'custom_type');

      expect(result).toContain('utm_content=custom_type');
    });

    it('should handle invalid URLs gracefully', () => {
      const invalidUrl = 'not-a-valid-url';
      const result = addUTMParameters(invalidUrl, username);

      expect(result).toBe(invalidUrl);
    });

    it('should handle empty URLs', () => {
      expect(addUTMParameters('', username)).toBe('');
      expect(addUTMParameters('   ', username)).toBe('   ');
    });

    it('should handle URLs with special characters in query params', () => {
      const url = 'https://example.com?email=test@example.com';
      const result = addUTMParameters(url, username);

      expect(result).toContain('email=test%40example.com');
      expect(result).toContain('utm_source=genfeedai_profile');
    });

    it('should handle usernames with special characters', () => {
      const url = 'https://example.com';
      const specialUsername = 'user-name_123';
      const result = addUTMParameters(url, specialUsername);

      expect(result).toContain('utm_campaign=user-name_123');
    });

    it('should generate proper UTM string for Calendly', () => {
      const url = 'https://calendly.com/johndoe/30min';
      const result = addUTMParameters(url, 'johndoe');

      expect(result).toBe(
        'https://calendly.com/johndoe/30min?utm_source=genfeedai_profile&utm_medium=profile_link&utm_campaign=johndoe&utm_content=integration_calendly',
      );
    });

    it('should handle HTTPS and HTTP protocols', () => {
      const httpsUrl = 'https://example.com';
      const httpUrl = 'http://example.com';

      const httpsResult = addUTMParameters(httpsUrl, username);
      const httpResult = addUTMParameters(httpUrl, username);

      expect(httpsResult).toContain('https://');
      expect(httpResult).toContain('http://');
    });
  });

  describe('buildUTMParameters', () => {
    it('should build UTM parameters object', () => {
      const result = buildUTMParameters('testuser', 'social_youtube');

      expect(result).toEqual({
        campaign: 'testuser',
        content: 'social_youtube',
        medium: 'profile_link',
        source: 'genfeedai_profile',
      });
    });

    it('should handle different usernames and link types', () => {
      const result = buildUTMParameters('john_doe', 'integration_calendly');

      expect(result.campaign).toBe('john_doe');
      expect(result.content).toBe('integration_calendly');
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long URLs', () => {
      const longUrl = `https://example.com/${'a'.repeat(1000)}`;
      const result = addUTMParameters(longUrl, 'user');

      expect(result).toContain('utm_source=genfeedai_profile');
      expect(result.length).toBeGreaterThan(longUrl.length);
    });

    it('should handle URLs with ports', () => {
      const url = 'https://example.com:8080/path';
      const result = addUTMParameters(url, 'user');

      expect(result).toContain(':8080');
      expect(result).toContain('utm_source=genfeedai_profile');
    });

    it('should handle URLs with authentication', () => {
      const url = 'https://user:pass@example.com/path';
      const result = addUTMParameters(url, 'user');

      expect(result).toContain('user:pass@');
      expect(result).toContain('utm_source=genfeedai_profile');
    });

    it('should handle international domain names', () => {
      const url = 'https://例え.jp';
      const result = addUTMParameters(url, 'user');

      expect(result).toContain('utm_source=genfeedai_profile');
    });
  });
});
