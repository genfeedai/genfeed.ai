import { describe, expect, it } from 'vitest';
import { parseSocialPostUrl } from '../../src/enums/social-post-url.util';
import { SocialSourcePlatform } from '../../src/enums/source-collector.enum';

describe('parseSocialPostUrl', () => {
  describe('X / Twitter', () => {
    it('parses a status URL into platform, author, and post id', () => {
      expect(
        parseSocialPostUrl('https://x.com/OpenAI/status/1234567890'),
      ).toEqual({
        authorHandle: 'openai',
        platform: SocialSourcePlatform.TWITTER,
        postId: '1234567890',
        url: 'https://x.com/OpenAI/status/1234567890',
      });
    });

    it('accepts twitter.com and www hosts with query params', () => {
      const result = parseSocialPostUrl(
        'https://www.twitter.com/openai/status/42?s=20&t=abc',
      );
      expect(result?.platform).toBe(SocialSourcePlatform.TWITTER);
      expect(result?.postId).toBe('42');
    });

    it('parses i/web status URLs without an author', () => {
      const result = parseSocialPostUrl('https://x.com/i/web/status/987');
      expect(result?.postId).toBe('987');
      expect(result?.authorHandle).toBeNull();
    });

    it('returns null for profile URLs — the silent-follow regression', () => {
      expect(parseSocialPostUrl('https://x.com/openai')).toBeNull();
    });

    it('returns null for non-numeric status ids', () => {
      expect(parseSocialPostUrl('https://x.com/openai/status/abc')).toBeNull();
    });
  });

  describe('Instagram', () => {
    it('parses post, reel, and tv shortcode URLs', () => {
      for (const path of ['p/DEf1gH2', 'reel/DEf1gH2', 'tv/DEf1gH2']) {
        const result = parseSocialPostUrl(`https://www.instagram.com/${path}/`);
        expect(result?.platform).toBe(SocialSourcePlatform.INSTAGRAM);
        expect(result?.postId).toBe('DEf1gH2');
        expect(result?.authorHandle).toBeNull();
      }
    });

    it('extracts the author from username-prefixed post URLs', () => {
      const result = parseSocialPostUrl(
        'https://www.instagram.com/natgeo/reel/DEf1gH2/',
      );
      expect(result?.authorHandle).toBe('natgeo');
      expect(result?.postId).toBe('DEf1gH2');
    });

    it('returns null for profile URLs', () => {
      expect(parseSocialPostUrl('https://instagram.com/natgeo')).toBeNull();
    });
  });

  describe('TikTok', () => {
    it('parses video URLs with the author handle', () => {
      expect(
        parseSocialPostUrl(
          'https://www.tiktok.com/@khaby.lame/video/7000000001',
        ),
      ).toEqual({
        authorHandle: 'khaby.lame',
        platform: SocialSourcePlatform.TIKTOK,
        postId: '7000000001',
        url: 'https://www.tiktok.com/@khaby.lame/video/7000000001',
      });
    });

    it('parses photo post URLs', () => {
      const result = parseSocialPostUrl(
        'https://www.tiktok.com/@user/photo/7000000002',
      );
      expect(result?.postId).toBe('7000000002');
    });

    it('returns null for profile URLs', () => {
      expect(parseSocialPostUrl('https://www.tiktok.com/@user')).toBeNull();
    });
  });

  describe('rejections', () => {
    it('returns null for plain handles and empty input', () => {
      expect(parseSocialPostUrl('@openai')).toBeNull();
      expect(parseSocialPostUrl('openai')).toBeNull();
      expect(parseSocialPostUrl('')).toBeNull();
    });

    it('returns null for unknown hosts even with post-like paths', () => {
      expect(
        parseSocialPostUrl('https://evil.example.com/openai/status/1'),
      ).toBeNull();
      expect(
        parseSocialPostUrl('https://x.com.evil.example.com/a/status/1'),
      ).toBeNull();
    });

    it('returns null for malformed URLs', () => {
      expect(parseSocialPostUrl('https://')).toBeNull();
      expect(parseSocialPostUrl('http://%')).toBeNull();
    });
  });
});
