import { CredentialPlatform } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

import { SocialUrlHelper } from './social-url.helper';

describe('SocialUrlHelper', () => {
  describe('buildProfileUrl', () => {
    it('prefers the stable YouTube channel id', () => {
      expect(
        SocialUrlHelper.buildProfileUrl(
          CredentialPlatform.YOUTUBE,
          '@genfeed',
          'channel-1',
        ),
      ).toBe('https://www.youtube.com/channel/channel-1');
    });

    it('normalizes account handles for profile routes', () => {
      expect(
        SocialUrlHelper.buildProfileUrl(CredentialPlatform.TWITTER, '@genfeed'),
      ).toBe('https://x.com/genfeed');
      expect(
        SocialUrlHelper.buildProfileUrl(CredentialPlatform.THREADS, '@genfeed'),
      ).toBe('https://www.threads.net/@genfeed');
    });

    it('returns undefined when a reliable profile route cannot be built', () => {
      expect(
        SocialUrlHelper.buildProfileUrl(CredentialPlatform.MASTODON, 'genfeed'),
      ).toBeUndefined();
      expect(
        SocialUrlHelper.buildProfileUrl(CredentialPlatform.INSTAGRAM),
      ).toBeUndefined();
      expect(
        SocialUrlHelper.buildProfileUrl(
          CredentialPlatform.LINKEDIN,
          'Jane Founder',
        ),
      ).toBeUndefined();
    });
  });

  describe('buildTwitterUrl', () => {
    it('throws if username is only @', () => {
      expect(() => SocialUrlHelper.buildTwitterUrl('123', '@')).toThrow(
        'Username cannot be empty',
      );
    });
  });

  describe('buildYoutubeUrl', () => {
    it('throws if videoId is empty', () => {
      expect(() => SocialUrlHelper.buildYoutubeUrl('')).toThrow(
        'Video ID is required',
      );
    });
  });

  describe('buildInstagramUrl', () => {
    it('throws if postId is empty', () => {
      expect(() => SocialUrlHelper.buildInstagramUrl('')).toThrow(
        'Post ID is required',
      );
    });
  });

  describe('buildTikTokUrl', () => {
    it('throws if videoId is empty', () => {
      expect(() => SocialUrlHelper.buildTikTokUrl('')).toThrow(
        'Video ID is required',
      );
    });
  });

  describe('buildLinkedInUrl', () => {
    it('throws if postId is empty', () => {
      expect(() => SocialUrlHelper.buildLinkedInUrl('')).toThrow(
        'Post ID is required',
      );
    });
  });
});

describe('SocialUrlHelper', () => {
  describe('buildTwitterUrl', () => {
    it('should remove @ symbol from username', () => {
      const url = SocialUrlHelper.buildTwitterUrl(
        '1991118023001022488',
        '@GenfeedAI',
      );
      expect(url).toBe('https://x.com/GenfeedAI/status/1991118023001022488');
    });

    it('should throw error if tweet ID is missing', () => {
      expect(() => SocialUrlHelper.buildTwitterUrl('', 'GenfeedAI')).toThrow(
        'Tweet ID is required',
      );
    });

    it('should throw error if username is missing', () => {
      expect(() => SocialUrlHelper.buildTwitterUrl('123', '')).toThrow(
        'Username is required for reliable Twitter URLs',
      );
    });

    it('should throw error for invalid tweet ID format', () => {
      expect(() =>
        SocialUrlHelper.buildTwitterUrl('abc123', 'GenfeedAI'),
      ).toThrow('Invalid tweet ID format');
    });
  });

  describe('buildYoutubeUrl', () => {
    it('should build a valid YouTube URL', () => {
      const url = SocialUrlHelper.buildYoutubeUrl('dQw4w9WgXcQ');
      expect(url).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    });
  });

  describe('buildInstagramUrl', () => {
    it('should build a valid Instagram URL', () => {
      const url = SocialUrlHelper.buildInstagramUrl('CXY-abc123');
      expect(url).toBe('https://www.instagram.com/p/CXY-abc123/');
    });
  });

  describe('buildTikTokUrl', () => {
    it('should build a TikTok URL without username', () => {
      const url = SocialUrlHelper.buildTikTokUrl('7123456789012345678');
      expect(url).toBe('https://www.tiktok.com/video/7123456789012345678');
    });

    it('should remove @ symbol from username', () => {
      const url = SocialUrlHelper.buildTikTokUrl(
        '7123456789012345678',
        '@username',
      );
      expect(url).toBe(
        'https://www.tiktok.com/@username/video/7123456789012345678',
      );
    });
  });

  describe('buildLinkedInUrl', () => {
    it('should build a LinkedIn URL with activity prefix', () => {
      const url = SocialUrlHelper.buildLinkedInUrl(
        'activity:7012345678901234567',
      );
      expect(url).toBe(
        'https://www.linkedin.com/feed/update/activity:7012345678901234567/',
      );
    });

    it('should add activity prefix if missing', () => {
      const url = SocialUrlHelper.buildLinkedInUrl('7012345678901234567');
      expect(url).toBe(
        'https://www.linkedin.com/feed/update/activity:7012345678901234567/',
      );
    });
  });
});
