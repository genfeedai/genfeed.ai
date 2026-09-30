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

  it('resolves every posting-time editor control label', () => {
    const translatePostingTimes = translateFromCatalog(
      'pages.credentialPostingTimes',
    );

    expect(translatePostingTimes('removeAriaLabel', { label: '09:00' })).toBe(
      'Remove 09:00',
    );
    expect(translatePostingTimes('newPostingTime')).toBe('New posting time');
    expect(translatePostingTimes('addTime')).toBe('Add a time');
  });
});
