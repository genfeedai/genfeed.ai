import { describe, expect, it } from 'vitest';

import { SocialUrlHelper } from './social-url.helper';

describe('SocialUrlHelper', () => {
  describe('buildTwitterUrl', () => {
    it('builds a valid Twitter/X URL', () => {
      expect(SocialUrlHelper.buildTwitterUrl('123456', 'testuser')).toBe(
        'https://x.com/testuser/status/123456',
      );
    });

    it('strips @ from username', () => {
      expect(SocialUrlHelper.buildTwitterUrl('123456', '@testuser')).toBe(
        'https://x.com/testuser/status/123456',
      );
    });

    it('throws if tweetId is empty', () => {
      expect(() => SocialUrlHelper.buildTwitterUrl('', 'user')).toThrow(
        'Tweet ID is required',
      );
    });

    it('throws if username is empty', () => {
      expect(() => SocialUrlHelper.buildTwitterUrl('123', '')).toThrow(
        'Username is required',
      );
    });

    it('throws if username is only @', () => {
      expect(() => SocialUrlHelper.buildTwitterUrl('123', '@')).toThrow(
        'Username cannot be empty',
      );
    });

    it('throws for non-numeric tweet ID', () => {
      expect(() => SocialUrlHelper.buildTwitterUrl('abc', 'user')).toThrow(
        'Invalid tweet ID format',
      );
    });
  });

  describe('buildYoutubeUrl', () => {
    it('builds a valid YouTube URL', () => {
      expect(SocialUrlHelper.buildYoutubeUrl('dQw4w9WgXcQ')).toBe(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      );
    });

    it('throws if videoId is empty', () => {
      expect(() => SocialUrlHelper.buildYoutubeUrl('')).toThrow(
        'Video ID is required',
      );
    });
  });

  describe('buildInstagramUrl', () => {
    it('builds a valid Instagram URL', () => {
      expect(SocialUrlHelper.buildInstagramUrl('ABC123')).toBe(
        'https://www.instagram.com/p/ABC123/',
      );
    });

    it('throws if postId is empty', () => {
      expect(() => SocialUrlHelper.buildInstagramUrl('')).toThrow(
        'Post ID is required',
      );
    });
  });

  describe('buildTikTokUrl', () => {
    it('builds URL with username', () => {
      expect(SocialUrlHelper.buildTikTokUrl('789', 'creator')).toBe(
        'https://www.tiktok.com/@creator/video/789',
      );
    });

    it('strips @ from username', () => {
      expect(SocialUrlHelper.buildTikTokUrl('789', '@creator')).toBe(
        'https://www.tiktok.com/@creator/video/789',
      );
    });

    it('builds URL without username', () => {
      expect(SocialUrlHelper.buildTikTokUrl('789')).toBe(
        'https://www.tiktok.com/video/789',
      );
    });

    it('throws if videoId is empty', () => {
      expect(() => SocialUrlHelper.buildTikTokUrl('')).toThrow(
        'Video ID is required',
      );
    });
  });

  describe('buildLinkedInUrl', () => {
    it('builds URL with activity prefix', () => {
      expect(SocialUrlHelper.buildLinkedInUrl('12345')).toBe(
        'https://www.linkedin.com/feed/update/activity:12345/',
      );
    });

    it('preserves existing activity: prefix', () => {
      expect(SocialUrlHelper.buildLinkedInUrl('activity:12345')).toBe(
        'https://www.linkedin.com/feed/update/activity:12345/',
      );
    });

    it('throws if postId is empty', () => {
      expect(() => SocialUrlHelper.buildLinkedInUrl('')).toThrow(
        'Post ID is required',
      );
    });
  });
});
