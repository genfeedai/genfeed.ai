import {
  buildProfileUrl,
  normalizeHandle,
  toSocialSourcePlatform,
} from '@api/collections/social-sources/utils/social-source-handle.util';
import { SocialSourcePlatform } from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import { BadRequestException } from '@nestjs/common';

const channelId = `UC${testId('channel').slice(1, 23).replace('channel', 'ChAnNeL')}`;
const secondChannelId = `UC${testId('channel', 2).slice(-22)}`;

describe('social-source-handle.util', () => {
  describe('toSocialSourcePlatform', () => {
    it('maps every collector platform from credential casing', () => {
      expect(toSocialSourcePlatform('INSTAGRAM')).toBe(
        SocialSourcePlatform.INSTAGRAM,
      );
      expect(toSocialSourcePlatform('YouTube')).toBe(
        SocialSourcePlatform.YOUTUBE,
      );
      expect(toSocialSourcePlatform('linkedin')).toBe(
        SocialSourcePlatform.LINKEDIN,
      );
      expect(toSocialSourcePlatform('FACEBOOK')).toBeUndefined();
      expect(toSocialSourcePlatform(null)).toBeUndefined();
    });
  });

  describe('normalizeHandle', () => {
    it('reads the handle behind LinkedIn and YouTube profile prefixes', () => {
      expect(
        normalizeHandle(
          SocialSourcePlatform.LINKEDIN,
          'https://www.linkedin.com/in/Vincent-Ships/',
        ),
      ).toBe('vincent-ships');
      expect(
        normalizeHandle(
          SocialSourcePlatform.LINKEDIN,
          'https://linkedin.com/company/genfeed',
        ),
      ).toBe('genfeed');
      expect(
        normalizeHandle(
          SocialSourcePlatform.YOUTUBE,
          'https://www.youtube.com/@Genfeed',
        ),
      ).toBe('genfeed');
      expect(
        normalizeHandle(
          SocialSourcePlatform.YOUTUBE,
          `https://www.youtube.com/channel/${channelId}`,
        ),
      ).toBe(channelId);
    });

    it.each([channelId, secondChannelId])(
      'preserves case-sensitive channel ID %s through repeated normalization and URL round trips',
      (channelId) => {
        const platform = SocialSourcePlatform.YOUTUBE;
        expect(normalizeHandle(platform, ` ${channelId} `)).toBe(channelId);
        expect(
          normalizeHandle(platform, normalizeHandle(platform, channelId)),
        ).toBe(channelId);
        const profileUrl = buildProfileUrl(platform, channelId);
        expect(profileUrl).toBe(`https://www.youtube.com/channel/${channelId}`);
        expect(normalizeHandle(platform, profileUrl)).toBe(channelId);
        expect(buildProfileUrl(platform, profileUrl)).toBe(profileUrl);
      },
    );

    it('keeps @ channel-ID-shaped values as handles through repeated normalization', () => {
      const platform = SocialSourcePlatform.YOUTUBE;
      const handle = `@${channelId}`;
      const normalized = channelId.toLowerCase();
      const profileUrl = `https://www.youtube.com/@${normalized}`;
      expect(normalizeHandle(platform, handle)).toBe(normalized);
      expect(buildProfileUrl(platform, handle)).toBe(profileUrl);
      expect(buildProfileUrl(platform, normalizeHandle(platform, handle))).toBe(
        profileUrl,
      );
      expect(
        normalizeHandle(platform, `https://www.youtube.com/${handle}`),
      ).toBe(normalized);
      expect(normalizeHandle(platform, profileUrl)).toBe(normalized);
    });

    it.each([
      'https://www.youtube.com/channel/UC12345',
      `https://www.youtube.com/channel/${channelId.toLowerCase()}`,
      'https://www.youtube.com/channel/',
      'https://www.youtube.com/user/Genfeed',
      'https://www.youtube.com/c/Genfeed',
      'https://www.youtube.com/Genfeed',
      'https://www.youtube.com/',
      'https://www.youtube.com/@',
    ])('rejects ambiguous, legacy or malformed YouTube URL %s', (url) => {
      expect(() => normalizeHandle(SocialSourcePlatform.YOUTUBE, url)).toThrow(
        BadRequestException,
      );
      expect(() => buildProfileUrl(SocialSourcePlatform.YOUTUBE, url)).toThrow(
        BadRequestException,
      );
    });

    it.each([
      [
        SocialSourcePlatform.INSTAGRAM,
        'https://www.instagram.com/Genfeed/',
        'https://www.instagram.com/genfeed',
      ],
      [
        SocialSourcePlatform.TIKTOK,
        'https://www.tiktok.com/@Genfeed',
        'https://www.tiktok.com/@genfeed',
      ],
      [
        SocialSourcePlatform.TWITTER,
        'https://twitter.com/Genfeed',
        'https://x.com/genfeed',
      ],
      [
        SocialSourcePlatform.LINKEDIN,
        'https://www.linkedin.com/in/Genfeed',
        'https://www.linkedin.com/in/genfeed',
      ],
    ])(
      'preserves existing %s profile behavior',
      (platform, input, expectedUrl) => {
        expect(normalizeHandle(platform, input)).toBe('genfeed');
        expect(buildProfileUrl(platform, input)).toBe(expectedUrl);
        expect(normalizeHandle(platform, `@${channelId}`)).toBe(
          channelId.toLowerCase(),
        );
      },
    );

    it('rejects post URLs so they go through import-post instead', () => {
      expect(() =>
        normalizeHandle(
          SocialSourcePlatform.YOUTUBE,
          'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        ),
      ).toThrow(BadRequestException);
    });

    it('rejects a profile URL on the wrong host', () => {
      expect(() =>
        normalizeHandle(
          SocialSourcePlatform.LINKEDIN,
          'https://www.youtube.com/@genfeed',
        ),
      ).toThrow('Profile URL must use linkedin.com');
    });
  });

  describe('buildProfileUrl', () => {
    it('builds platform-specific profile URLs and never falls back to X', () => {
      expect(buildProfileUrl(SocialSourcePlatform.YOUTUBE, '@Genfeed')).toBe(
        'https://www.youtube.com/@genfeed',
      );
      expect(buildProfileUrl(SocialSourcePlatform.LINKEDIN, 'vincent')).toBe(
        'https://www.linkedin.com/in/vincent',
      );
      expect(buildProfileUrl(SocialSourcePlatform.TWITTER, 'genfeed')).toBe(
        'https://x.com/genfeed',
      );
      expect(() => buildProfileUrl('facebook', 'genfeed')).toThrow(
        BadRequestException,
      );
    });
  });
});
