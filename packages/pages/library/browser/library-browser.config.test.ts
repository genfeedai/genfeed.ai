import { IngredientCategory, LibraryShelf } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { describe, expect, it } from 'vitest';
import {
  LIBRARY_SHELF_DESCRIPTIONS,
  LIBRARY_SORT_OPTIONS,
  LIBRARY_TYPE_CHIPS,
  LIBRARY_TYPE_PRESETS,
} from './library-browser.config';

describe('LIBRARY_TYPE_CHIPS', () => {
  it('never lists the same category twice', () => {
    const all = LIBRARY_TYPE_CHIPS.flatMap((chip) => [...chip.categories]);

    expect(all).toEqual(Array.from(new Set(all)));
  });

  it('only names real ingredient categories', () => {
    const known = new Set<string>(Object.values(IngredientCategory));

    for (const chip of LIBRARY_TYPE_CHIPS) {
      for (const category of chip.categories) {
        expect(known.has(category)).toBe(true);
      }
    }
  });

  it('keeps filter labels singular so they match table pills', () => {
    expect(LIBRARY_TYPE_CHIPS.map((chip) => chip.label)).toEqual([
      'Image',
      'Video',
      'GIF',
      'Avatar',
      'Audio',
      'Voice',
      'Text',
    ]);
  });
});

describe('LIBRARY_TYPE_PRESETS', () => {
  it('seeds each type route from exactly one chip group', () => {
    for (const preset of Object.values(LIBRARY_TYPE_PRESETS)) {
      const chip = LIBRARY_TYPE_CHIPS.find(
        (entry) =>
          entry.categories.length === preset.categories.length &&
          entry.categories.every((category) =>
            preset.categories.includes(category),
          ),
      );

      // A preset that spans half a chip would render its own chip as inactive
      // the moment the page loads.
      expect(chip).toBeDefined();
    }
  });

  it('is keyed by live library routes', () => {
    expect(Object.keys(LIBRARY_TYPE_PRESETS).sort()).toEqual(
      [
        APP_ROUTES.LIBRARY.AVATARS,
        APP_ROUTES.LIBRARY.GIFS,
        APP_ROUTES.LIBRARY.IMAGES,
        APP_ROUTES.LIBRARY.MUSIC,
        APP_ROUTES.LIBRARY.VIDEOS,
      ].sort(),
    );
  });
});

describe('LIBRARY_SHELF_DESCRIPTIONS', () => {
  it('describes every shelf', () => {
    for (const shelf of Object.values(LibraryShelf)) {
      expect(LIBRARY_SHELF_DESCRIPTIONS[shelf]).toBeTruthy();
    }
  });
});

describe('LIBRARY_SORT_OPTIONS', () => {
  it('uses the API `field: direction` contract', () => {
    for (const option of LIBRARY_SORT_OPTIONS) {
      expect(option.value).toMatch(/^[a-zA-Z]+: (-1|1)$/);
    }
  });
});
