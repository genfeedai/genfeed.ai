import { describe, expect, it } from 'vitest';
import { translateFromCatalog } from './next-intl.stub';

describe('translateFromCatalog', () => {
  const translateWatchlist = translateFromCatalog(
    'pages.adsResearch.watchlist',
  );

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
