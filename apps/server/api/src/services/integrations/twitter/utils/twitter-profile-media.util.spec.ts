import { describe, expect, it } from 'vitest';
import {
  readTwitterBannerUrl,
  toTwitterFullSizeAvatarUrl,
} from './twitter-profile-media.util';

describe('toTwitterFullSizeAvatarUrl', () => {
  it('upgrades the 48px _normal avatar to the 400px rendition', () => {
    expect(
      toTwitterFullSizeAvatarUrl(
        'https://pbs.twimg.com/profile_images/1/abc_normal.jpg',
      ),
    ).toBe('https://pbs.twimg.com/profile_images/1/abc_400x400.jpg');
  });

  it('leaves other renditions and missing values alone', () => {
    expect(
      toTwitterFullSizeAvatarUrl(
        'https://pbs.twimg.com/profile_images/1/abc_400x400.png',
      ),
    ).toBe('https://pbs.twimg.com/profile_images/1/abc_400x400.png');
    expect(toTwitterFullSizeAvatarUrl(undefined)).toBeUndefined();
  });
});

describe('readTwitterBannerUrl', () => {
  it('requests the full-width rendition of a size-less banner URL', () => {
    expect(
      readTwitterBannerUrl({
        profile_banner_url:
          'https://pbs.twimg.com/profile_banners/1/1700000000',
      }),
    ).toBe('https://pbs.twimg.com/profile_banners/1/1700000000/1500x500');
  });

  it('keeps an explicit rendition', () => {
    expect(
      readTwitterBannerUrl({
        profile_banner_url:
          'https://pbs.twimg.com/profile_banners/1/1700000000/600x200',
      }),
    ).toBe('https://pbs.twimg.com/profile_banners/1/1700000000/600x200');
  });

  it.each([{}, { profile_banner_url: '' }, { profile_banner_url: 42 }])(
    'ignores %j',
    (user) => {
      expect(readTwitterBannerUrl(user)).toBeUndefined();
    },
  );
});
