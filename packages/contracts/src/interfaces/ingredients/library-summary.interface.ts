import type { IngredientCategory, LibraryShelf } from '../..';

/**
 * Per-shelf and per-type counts backing the Library sidebar.
 *
 * Shelf counts intentionally overlap and do not sum to `total`: a single asset
 * can be both `needs-review` and unfoldered, and `total` excludes archived,
 * rejected, and failed rows that only their own shelf surfaces. Treat each count
 * as the size of that shelf's saved query, never as a partition.
 */
export interface ILibrarySummary {
  /** Assets in the default "All assets" view (excludes trash and archive). */
  total: number;
  /** Count per asset type, keyed by `IngredientCategory`. */
  byCategory: Partial<Record<IngredientCategory, number>>;
  /** Count per shelf, keyed by `LibraryShelf`. */
  byShelf: Record<LibraryShelf, number>;
  /** Assets the operator has starred. */
  starredCount: number;
  /** Soft-deleted assets still recoverable from Trash. */
  trashedCount: number;
  /** Sum of `fileSize` across the default view, in bytes. */
  storageBytes: number;
}
