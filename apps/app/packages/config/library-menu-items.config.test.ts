import { describe, expect, it } from 'vitest';
import {
  LIBRARY_MENU_ITEMS,
  LIBRARY_PLACE_MENU_ITEMS,
  LIBRARY_SHELF_MENU_ITEMS,
  LIBRARY_TAIL_MENU_ITEMS,
} from './library-menu-items.config';

describe('LIBRARY_MENU_ITEMS', () => {
  it('navigates by place and shelf, never by asset type', () => {
    expect(LIBRARY_MENU_ITEMS.map((item) => item.href)).toEqual([
      '/library/assets',
      '/library/assets?place=recent',
      '/library/assets?place=starred',
      '/library/assets?shelf=generating',
      '/library/assets?shelf=unsorted',
      '/library/assets?shelf=needs-review',
      '/library/assets?shelf=approved',
      '/library/assets?shelf=failed',
      '/library/assets?shelf=archived',
      '/library/assets?place=trash',
    ]);
  });

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

  it('keeps Library destinations flat without obsolete divider metadata', () => {
    expect(LIBRARY_TAIL_MENU_ITEMS.every((item) => !item.hasDividerAbove)).toBe(
      true,
    );
  });

  it('does not keep Brand Knowledge under Library', () => {
    expect(
      LIBRARY_MENU_ITEMS.some((item) => item.href === '/library/knowledge'),
    ).toBe(false);
    expect(LIBRARY_MENU_ITEMS.some((item) => item.label === 'Knowledge')).toBe(
      false,
    );
  });
});
