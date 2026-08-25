import { describe, expect, it } from 'vitest';
import { translateFromCatalog } from './next-intl.stub';

describe('translateFromCatalog', () => {
  const translateWatchlist = translateFromCatalog(
    'pages.adsResearch.watchlist',
  );

  it('selects the singular ICU plural branch', () => {
    expect(translateWatchlist('creatives', { count: 1 })).toBe('1 creative');
  });

  it('selects the plural ICU plural branch', () => {
    expect(translateWatchlist('creatives', { count: 12 })).toBe('12 creatives');
  });

  it('keeps simple interpolation working', () => {
    const translatePlatform = translateFromCatalog('pages.platforms.home');

    expect(translatePlatform('title', { platform: 'YouTube' })).toBe(
      'YouTube home',
    );
  });
});
