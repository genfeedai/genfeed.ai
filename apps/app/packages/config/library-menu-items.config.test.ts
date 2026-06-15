import { describe, expect, it } from 'vitest';
import {
  LIBRARY_LOGO_HREF,
  LIBRARY_MENU_ITEMS,
} from './library-menu-items.config';

describe('LIBRARY_MENU_ITEMS', () => {
  it('lists every library category route', () => {
    expect(LIBRARY_MENU_ITEMS.map((item) => item.href)).toEqual([
      '/library/videos',
      '/library/images',
      '/library/gifs',
      '/library/avatars',
      '/library/voices',
      '/library/music',
      '/library/captions',
    ]);
  });

  it('separates visual assets from utility assets with a divider', () => {
    const voicesItem = LIBRARY_MENU_ITEMS.find(
      (item) => item.href === '/library/voices',
    );

    expect(voicesItem).toMatchObject({
      hasDividerAbove: true,
      label: 'Voices',
    });
  });

  it('points the library logo at the ingredients landing', () => {
    expect(LIBRARY_LOGO_HREF).toBe('/library/ingredients');
  });
});
