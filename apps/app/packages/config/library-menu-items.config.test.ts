import { describe, expect, it } from 'vitest';
import {
  LIBRARY_MENU_ITEMS,
  LIBRARY_PLACE_MENU_ITEMS,
  LIBRARY_SHELF_MENU_ITEMS,
} from './library-menu-items.config';

describe('LIBRARY_MENU_ITEMS', () => {
  it('navigates by place and shelf, never by asset type', () => {
    expect(LIBRARY_MENU_ITEMS.map((item) => item.href)).toEqual([
      '/library/assets',
      '/library/recent',
      '/library/starred',
      '/library/shelf/generating',
      '/library/shelf/unsorted',
      '/library/shelf/needs-review',
      '/library/shelf/approved',
      '/library/shelf/failed',
      '/library/shelf/archived',
      '/library/moodboard',
      '/library/trash',
    ]);
  });

  it('lights up All assets for every type-seeded deep link', () => {
    const allAssets = LIBRARY_PLACE_MENU_ITEMS.find(
      (item) => item.label === 'All assets',
    );

    expect(allAssets?.matchPaths).toEqual([
      '/library/assets',
      '/library/videos',
      '/library/images',
      '/library/gifs',
      '/library/avatars',
      '/library/voices',
      '/library/music',
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

  it('does not resurrect the retired overview tile grid', () => {
    expect(
      LIBRARY_MENU_ITEMS.some((item) => item.href === '/library/overview'),
    ).toBe(false);
    expect(LIBRARY_MENU_ITEMS.some((item) => item.label === 'Overview')).toBe(
      false,
    );
  });

  it('does not keep Activity under Library', () => {
    expect(
      LIBRARY_MENU_ITEMS.some((item) => item.href === '/workspace/activity'),
    ).toBe(false);
    expect(LIBRARY_MENU_ITEMS.some((item) => item.label === 'Activity')).toBe(
      false,
    );
  });
});
