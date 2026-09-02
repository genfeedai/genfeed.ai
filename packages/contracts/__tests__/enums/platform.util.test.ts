import {
  formatCompactPlatformLabel,
  formatPlatformLabel,
  isPlatform,
  isSourcePostVariationPlatform,
  isTwitterPlatform,
  isYouTubePlatform,
  Platform,
  parsePlatform,
  SOURCE_POST_VARIATION_PLATFORMS,
} from '../../src';

describe('platform.util', () => {
  it('parses enum values and aliases', () => {
    expect(parsePlatform('youtube')).toBe(Platform.YOUTUBE);
    expect(parsePlatform('  Twitter  ')).toBe(Platform.TWITTER);
    expect(parsePlatform('x')).toBe(Platform.TWITTER);
    expect(parsePlatform('meta')).toBe(Platform.FACEBOOK);
    expect(parsePlatform('not-a-platform')).toBeUndefined();
    expect(parsePlatform('')).toBeUndefined();
    expect(parsePlatform(null)).toBeUndefined();
  });

  it('narrows with isPlatform', () => {
    expect(isPlatform(Platform.TIKTOK)).toBe(true);
    expect(isPlatform('x')).toBe(false);
  });

  it('formats display labels without bare string branches', () => {
    expect(formatPlatformLabel(Platform.TWITTER)).toBe('X');
    expect(formatPlatformLabel('x')).toBe('X');
    expect(formatPlatformLabel(Platform.YOUTUBE)).toBe('YouTube');
    expect(formatPlatformLabel(Platform.TIKTOK)).toBe('TikTok');
    expect(formatPlatformLabel(Platform.LINKEDIN)).toBe('LinkedIn');
    expect(formatPlatformLabel(Platform.GOOGLE_ADS)).toBe('Google Ads');
  });

  it('formats compact labels for dense platform indicators', () => {
    expect(formatCompactPlatformLabel(Platform.INSTAGRAM)).toBe('IG');
    expect(formatCompactPlatformLabel(Platform.YOUTUBE)).toBe('YT');
    expect(formatCompactPlatformLabel('x')).toBe('X');
    expect(formatCompactPlatformLabel('custom')).toBe('CU');
    expect(formatCompactPlatformLabel('')).toBeNull();
  });

  it('exposes platform predicates', () => {
    expect(isTwitterPlatform('x')).toBe(true);
    expect(isTwitterPlatform(Platform.TWITTER)).toBe(true);
    expect(isYouTubePlatform('youtube')).toBe(true);
    expect(isYouTubePlatform('YOUTUBE')).toBe(true);
    expect(isYouTubePlatform('tiktok')).toBe(false);
  });

  it('narrows source-post variation platforms to existing Platform members', () => {
    expect(SOURCE_POST_VARIATION_PLATFORMS).toEqual([
      Platform.INSTAGRAM,
      Platform.LINKEDIN,
      Platform.TIKTOK,
      Platform.TWITTER,
    ]);
    expect(isSourcePostVariationPlatform(Platform.INSTAGRAM)).toBe(true);
    expect(isSourcePostVariationPlatform('x')).toBe(true);
    expect(isSourcePostVariationPlatform(Platform.YOUTUBE)).toBe(false);
    expect(isSourcePostVariationPlatform('not-a-platform')).toBe(false);
  });
});
