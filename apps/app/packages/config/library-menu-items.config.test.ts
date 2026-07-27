import { describe, expect, it } from 'vitest';
import {
  LIBRARY_LOGO_HREF,
  LIBRARY_MENU_ITEMS,
} from './library-menu-items.config';

describe('LIBRARY_MENU_ITEMS', () => {
  it('lists library destinations rather than asset-type filters', () => {
    expect(LIBRARY_MENU_ITEMS.map((item) => item.href)).toEqual([
      '/library/overview',
      '/library/videos',
      '/library/moodboard',
      '/workspace/activity',
    ]);
  });

  it('matches every asset-type route through the Assets destination', () => {
    const assetsItem = LIBRARY_MENU_ITEMS.find(
      (item) => item.label === 'Assets',
    );

    expect(assetsItem?.matchPaths).toEqual([
      '/library/videos',
      '/library/images',
      '/library/gifs',
      '/library/avatars',
      '/library/voices',
      '/library/music',
      '/library/captions',
    ]);
  });

  it('points the library logo at the canonical overview', () => {
    expect(LIBRARY_LOGO_HREF).toBe('/library/overview');
  });
});
