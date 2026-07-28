import {
  formatPlatformLabel,
  isPlatform,
  isTwitterPlatform,
  isYouTubePlatform,
  Platform,
  parsePlatform,
} from '../src';

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

  it('exposes platform predicates', () => {
    expect(isTwitterPlatform('x')).toBe(true);
    expect(isTwitterPlatform(Platform.TWITTER)).toBe(true);
    expect(isYouTubePlatform('youtube')).toBe(true);
    expect(isYouTubePlatform('tiktok')).toBe(false);
  });
});
