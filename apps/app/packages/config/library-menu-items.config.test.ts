import { describe, expect, it } from 'vitest';
import {
  LIBRARY_MENU_ITEMS,
  LIBRARY_PLACE_MENU_ITEMS,
} from './library-menu-items.config';

describe('LIBRARY_MENU_ITEMS', () => {
  it('is Overview, Assets and References, never a shelf, trash, recency, or type (#5502)', () => {
    expect(LIBRARY_MENU_ITEMS.map((item) => item.label)).toEqual([
      'Overview',
      'Assets',
      'References',
    ]);
    expect(LIBRARY_MENU_ITEMS.map((item) => item.href)).toEqual([
      '/library/overview',
      '/library/assets',
      '/library/references',
    ]);
    expect(
      LIBRARY_MENU_ITEMS.some((item) => item.href?.includes('place=')),
    ).toBe(false);
    expect(
      LIBRARY_MENU_ITEMS.some((item) => item.href?.includes('shelf=')),
    ).toBe(false);
  });

  it('keeps Assets lit while a Recent, Starred, or shelf filter is applied', () => {
    const assets = LIBRARY_PLACE_MENU_ITEMS.find(
      (item) => item.label === 'Assets',
    );

    expect(assets?.matchSearchParams).toBeUndefined();
  });

  it('lights up Assets for every type-seeded deep link', () => {
    const assets = LIBRARY_PLACE_MENU_ITEMS.find(
      (item) => item.label === 'Assets',
    );

    expect(assets?.matchPaths).toEqual([
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

  it('lights Overview only on the Library home, not on Assets', () => {
    const overview = LIBRARY_PLACE_MENU_ITEMS.find(
      (item) => item.label === 'Overview',
    );

    expect(overview).toEqual(
      expect.objectContaining({
        isExactMatch: true,
        matchPaths: ['/library/overview', '/library'],
      }),
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
    expect(LIBRARY_MENU_ITEMS.every((item) => !item.hasDividerAbove)).toBe(
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
