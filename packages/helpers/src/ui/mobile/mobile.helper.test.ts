import {
  getDeepLink,
  isAndroidDevice,
  isiOSDevice,
  isMobileDevice,
} from '@helpers/ui/mobile/mobile.helper';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const setUserAgent = (ua: string) => {
  Object.defineProperty(navigator, 'userAgent', {
    configurable: true,
    get: () => ua,
  });
};

describe('mobile.helper', () => {
  const originalUA = navigator.userAgent;

  afterEach(() => {
    setUserAgent(originalUA);
  });

  describe('isMobileDevice', () => {
    it('returns true for Android user agent', () => {
      setUserAgent(
        'Mozilla/5.0 (Linux; Android 10; Pixel 4) AppleWebKit/537.36',
      );
      expect(isMobileDevice()).toBe(true);
    });

    it('returns true for iPhone user agent', () => {
      setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)');
      expect(isMobileDevice()).toBe(true);
    });

    it('returns true for iPad user agent', () => {
      setUserAgent('Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X)');
      expect(isMobileDevice()).toBe(true);
    });

    it('returns false for desktop user agent', () => {
      setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      );
      expect(isMobileDevice()).toBe(false);
    });
  });

  describe('isAndroidDevice', () => {
    it('returns true for Android user agent', () => {
      setUserAgent(
        'Mozilla/5.0 (Linux; Android 10; Pixel 4) AppleWebKit/537.36',
      );
      expect(isAndroidDevice()).toBe(true);
    });

    it('returns false for iPhone user agent', () => {
      setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)');
      expect(isAndroidDevice()).toBe(false);
    });
  });

  describe('isiOSDevice', () => {
    it('returns true for iPhone user agent', () => {
      setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)');
      expect(isiOSDevice()).toBe(true);
    });

    it('returns true for iPad user agent', () => {
      setUserAgent('Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X)');
      expect(isiOSDevice()).toBe(true);
    });

    it('returns false for Android user agent', () => {
      setUserAgent(
        'Mozilla/5.0 (Linux; Android 10; Pixel 4) AppleWebKit/537.36',
      );
      expect(isiOSDevice()).toBe(false);
    });
  });

  describe('getDeepLink', () => {
    beforeEach(() => {
      // Use desktop UA by default (not mobile)
      setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      );
    });

    it('returns the url unchanged for desktop', () => {
      const url = 'https://youtube.com/watch?v=abc123';
      expect(getDeepLink(url, false)).toBe(url);
    });

    it('returns youtube deep link on iOS', () => {
      setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)');
      const result = getDeepLink(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        true,
      );
      expect(result).toContain('dQw4w9WgXcQ');
    });

    it('returns youtube intent link on Android', () => {
      setUserAgent(
        'Mozilla/5.0 (Linux; Android 10; Pixel 4) AppleWebKit/537.36',
      );
      const result = getDeepLink(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        true,
      );
      expect(result).toContain('intent://');
    });

    it('handles youtu.be short links on iOS', () => {
      setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)');
      const result = getDeepLink('https://youtu.be/dQw4w9WgXcQ', true);
      expect(result).toContain('dQw4w9WgXcQ');
    });

    it('returns twitter deep link for tweet on iOS', () => {
      setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)');
      const result = getDeepLink('https://x.com/GenfeedAI/status/123456', true);
      expect(result).toContain('twitter://');
    });

    it('returns instagram deep link for post on iOS', () => {
      setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)');
      const result = getDeepLink('https://instagram.com/p/ABC123/', true);
      expect(result).toContain('instagram://');
    });

    it('returns TikTok deep link for user on iOS', () => {
      setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)');
      const result = getDeepLink('https://www.tiktok.com/@username', true);
      expect(result).toContain('username');
    });

    it('returns LinkedIn deep link for profile on iOS', () => {
      setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)');
      const result = getDeepLink('https://www.linkedin.com/in/johndoe/', true);
      expect(result).toContain('linkedin://');
    });

    it('returns original url for unknown domains on mobile', () => {
      setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)');
      const url = 'https://example.com/some/path';
      expect(getDeepLink(url, true)).toBe(url);
    });

    it('handles invalid URLs gracefully', () => {
      const badUrl = 'not-a-valid-url';
      expect(getDeepLink(badUrl, true)).toBe(badUrl);
    });
  });
});
