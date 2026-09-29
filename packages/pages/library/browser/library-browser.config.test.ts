import { LibraryShelf } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import {
  LIBRARY_SHELF_DESCRIPTIONS,
  LIBRARY_TYPE_CHIPS,
} from './library-browser.config';

describe('LIBRARY_TYPE_CHIPS', () => {
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

describe('LIBRARY_SHELF_DESCRIPTIONS', () => {
  it('describes every shelf', () => {
    for (const shelf of Object.values(LibraryShelf)) {
      expect(LIBRARY_SHELF_DESCRIPTIONS[shelf]).toBeTruthy();
    }
  });
});
