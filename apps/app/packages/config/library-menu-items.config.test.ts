import { describe, expect, it } from 'vitest';
import {
  LIBRARY_PLACE_MENU_ITEMS,
  LIBRARY_SHELF_MENU_ITEMS,
  LIBRARY_TAIL_MENU_ITEMS,
} from './library-menu-items.config';

describe('LIBRARY_MENU_ITEMS', () => {
  it('lights up All assets for every type-seeded deep link', () => {
    const allAssets = LIBRARY_PLACE_MENU_ITEMS.find(
      (item) => item.label === 'All assets',
    );

    expect(allAssets?.matchPaths).toEqual([
      '/library/assets',
      '/library/assets?categories=VIDEO&categories=VIDEO_EDIT',
      '/library/assets?categories=IMAGE&categories=IMAGE_EDIT',
      '/library/assets?categories=GIF',
      '/library/assets?categories=AVATAR',
      '/library/voices',
      '/library/assets?categories=MUSIC&categories=AUDIO',
      '/library/captions',
    ]);
  });

  it('orders shelves by generation lifecycle', () => {
    expect(LIBRARY_SHELF_MENU_ITEMS.map((item) => item.label)).toEqual([
      'Generating',
      'Unsorted',
      'Needs review',
      'Approved',
      'Failed',
      'Archived',
    ]);
    expect(
      LIBRARY_SHELF_MENU_ITEMS.every((item) => item.group === 'Shelves'),
    ).toBe(true);
  });

  it('keeps Library destinations flat without obsolete divider metadata', () => {
    expect(LIBRARY_TAIL_MENU_ITEMS.every((item) => !item.hasDividerAbove)).toBe(
      true,
    );
  });
});
