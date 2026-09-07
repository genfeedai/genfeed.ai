import {
  buildProfileUrl,
  normalizeHandle,
  toSocialSourcePlatform,
} from '@api/collections/social-sources/utils/social-source-handle.util';
import { SocialSourcePlatform } from '@genfeedai/contracts';
import { BadRequestException } from '@nestjs/common';

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
          'https://www.youtube.com/channel/UC12345',
        ),
      ).toBe('uc12345');
    });

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
