import type { IIngredient, IMoodBoardLayoutItem } from '@genfeedai/interfaces';

/**
 * Default tile + grid geometry used when auto-placing assets that do not yet
 * have a persisted position. Values are canvas units (React Flow coordinates).
 */
export const MOOD_BOARD_TILE_WIDTH = 280;
export const MOOD_BOARD_TILE_HEIGHT = 320;
export const MOOD_BOARD_GRID_GAP = 32;
export const MOOD_BOARD_DEFAULT_COLUMNS = 5;

/**
 * A canvas-ready asset: a live ingredient paired with the position it should
 * render at. Produced by {@link mergeMoodBoardLayout}.
 */
export interface MoodBoardNodeSeed {
  assetId: string;
  ingredient: IIngredient;
  position: { x: number; y: number };
  width?: number;
  z?: number;
}

export interface MergeMoodBoardLayoutResult {
  /** One seed per live asset, in the same order as `assets`. */
  seeds: MoodBoardNodeSeed[];
  /**
   * The layout to persist: positions for every live asset. Entries for assets
   * that no longer exist are dropped (pruned), so persisting this keeps the
   * board self-healing.
   */
  layout: IMoodBoardLayoutItem[];
}

function gridPosition(
  index: number,
  columns: number,
  baseY: number,
): { x: number; y: number } {
  const safeColumns = Math.max(1, columns);
  const column = index % safeColumns;
  const row = Math.floor(index / safeColumns);

  return {
    x: column * (MOOD_BOARD_TILE_WIDTH + MOOD_BOARD_GRID_GAP),
    y: baseY + row * (MOOD_BOARD_TILE_HEIGHT + MOOD_BOARD_GRID_GAP),
  };
}

/**
 * Merge live assets with a brand's saved board layout.
 *
 * - Assets with a saved position keep it.
 * - Assets without one are auto-placed in a grid, in a band below any saved
 *   content so they never overlap existing tiles.
 * - Saved entries for assets that no longer exist are pruned.
 *
 * Content (urls, dimensions) always comes from the live `assets`; only the
 * position is sourced from `savedLayout`. This is what keeps the board fresh as
 * assets are generated or deleted.
 */
export function mergeMoodBoardLayout(
  assets: IIngredient[],
  savedLayout: IMoodBoardLayoutItem[] = [],
  columns: number = MOOD_BOARD_DEFAULT_COLUMNS,
): MergeMoodBoardLayoutResult {
  const savedById = new Map<string, IMoodBoardLayoutItem>(
    savedLayout
      .filter((item) => typeof item?.assetId === 'string')
      .map((item) => [item.assetId, item]),
  );

  const liveIds = new Set(assets.map((asset) => asset.id));

  // Band where freshly added (un-positioned) assets start, kept clear of saved tiles.
  const maxSavedY = savedLayout.reduce((max, item) => {
    if (!liveIds.has(item.assetId)) {
      return max;
    }
    return Math.max(max, item.position?.y ?? 0);
  }, Number.NEGATIVE_INFINITY);

  const hasSaved = Number.isFinite(maxSavedY);
  const newAssetBaseY = hasSaved
    ? maxSavedY + MOOD_BOARD_TILE_HEIGHT + MOOD_BOARD_GRID_GAP
    : 0;

  let newAssetIndex = 0;

  const seeds: MoodBoardNodeSeed[] = assets.map((ingredient) => {
    const saved = savedById.get(ingredient.id);

    if (saved?.position) {
      return {
        assetId: ingredient.id,
        ingredient,
        position: { x: saved.position.x, y: saved.position.y },
        width: saved.width,
        z: saved.z,
      };
    }

    const position = gridPosition(newAssetIndex, columns, newAssetBaseY);
    newAssetIndex += 1;

    return { assetId: ingredient.id, ingredient, position };
  });

  const layout: IMoodBoardLayoutItem[] = seeds.map((seed) => ({
    assetId: seed.assetId,
    position: seed.position,
    ...(seed.width !== undefined ? { width: seed.width } : {}),
    ...(seed.z !== undefined ? { z: seed.z } : {}),
  }));

  return { seeds, layout };
}

/**
 * Project the current React Flow node positions back into a persistable layout,
 * keyed by asset id. Nodes whose id is not a known asset id are ignored.
 */
export function toMoodBoardLayout(
  nodes: Array<{ id: string; position: { x: number; y: number } }>,
  knownAssetIds: Set<string>,
): IMoodBoardLayoutItem[] {
  return nodes
    .filter((node) => knownAssetIds.has(node.id))
    .map((node) => ({
      assetId: node.id,
      position: { x: node.position.x, y: node.position.y },
    }));
}
