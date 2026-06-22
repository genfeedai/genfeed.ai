import type { IIngredient, IMoodBoardLayoutItem } from '@genfeedai/interfaces';
import {
  MOOD_BOARD_TILE_HEIGHT,
  mergeMoodBoardLayout,
  toMoodBoardLayout,
} from '@genfeedai/utils/moodboard/mood-board-layout.util';
import { describe, expect, it } from 'vitest';

function asset(id: string): IIngredient {
  return {
    id,
    isDeleted: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as IIngredient;
}

function saved(assetId: string, x: number, y: number): IMoodBoardLayoutItem {
  return { assetId, position: { x, y } };
}

describe('mergeMoodBoardLayout', () => {
  it('keeps saved positions for known assets', () => {
    const { seeds } = mergeMoodBoardLayout(
      [asset('a'), asset('b')],
      [saved('a', 100, 200), saved('b', 300, 400)],
    );

    expect(seeds[0].position).toEqual({ x: 100, y: 200 });
    expect(seeds[1].position).toEqual({ x: 300, y: 400 });
  });

  it('auto-places new assets in a grid below saved content', () => {
    const { seeds } = mergeMoodBoardLayout(
      [asset('saved'), asset('fresh')],
      [saved('saved', 0, 0)],
    );

    const fresh = seeds.find((seed) => seed.assetId === 'fresh');
    expect(fresh?.position.x).toBe(0);
    // Placed in a band strictly below the saved tile.
    expect(fresh?.position.y).toBeGreaterThanOrEqual(MOOD_BOARD_TILE_HEIGHT);
  });

  it('places new assets below the true bottom edge of a tall saved tile', () => {
    // A portrait tile (400x800 → aspectRatio 0.5) renders 560 tall
    // (MOOD_BOARD_TILE_WIDTH 280 / 0.5), well past the default tile height.
    const tall = {
      ...asset('tall'),
      metadataWidth: 400,
      metadataHeight: 800,
    } as IIngredient;

    const { seeds } = mergeMoodBoardLayout(
      [tall, asset('fresh')],
      [saved('tall', 0, 0)],
    );

    const fresh = seeds.find((seed) => seed.assetId === 'fresh');
    // Must clear the saved tile's rendered bottom (560), not just the default
    // tile height (320) — the previous implementation overlapped here.
    expect(fresh?.position.y).toBeGreaterThan(560);
  });

  it('places all assets from origin when there is no saved layout', () => {
    const { seeds } = mergeMoodBoardLayout([asset('a'), asset('b')], []);

    expect(seeds[0].position).toEqual({ x: 0, y: 0 });
    expect(seeds[1].position.x).toBeGreaterThan(0);
    expect(seeds[1].position.y).toBe(0);
  });

  it('prunes saved entries for assets that no longer exist', () => {
    const { layout } = mergeMoodBoardLayout(
      [asset('a')],
      [saved('a', 10, 20), saved('ghost', 99, 99)],
    );

    expect(layout.map((item) => item.assetId)).toEqual(['a']);
  });

  it('emits a layout entry for every live asset', () => {
    const { layout } = mergeMoodBoardLayout(
      [asset('a'), asset('b'), asset('c')],
      [saved('a', 10, 20)],
    );

    expect(layout).toHaveLength(3);
    expect(layout.find((item) => item.assetId === 'a')?.position).toEqual({
      x: 10,
      y: 20,
    });
  });
});

describe('toMoodBoardLayout', () => {
  it('keeps only nodes whose id is a known asset', () => {
    const layout = toMoodBoardLayout(
      [
        { id: 'a', position: { x: 1, y: 2 } },
        { id: 'unknown', position: { x: 3, y: 4 } },
      ],
      new Set(['a']),
    );

    expect(layout).toEqual([{ assetId: 'a', position: { x: 1, y: 2 } }]);
  });
});
