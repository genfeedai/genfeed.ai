/**
 * Library shelf — the *generation-state* axis of the Library.
 *
 * A shelf is a saved query over `ingredients`, not a location. An asset sits on
 * exactly one shelf at a time and the shelf moves on its own as generation and
 * review progress; a folder only moves when a human moves it. That independence
 * is the whole point of having both axes.
 *
 * These are UI filter keys / URL segments, not persisted statuses — lowercase
 * product language is correct here (`enum_source_of_truth.md` rule 3). The
 * predicates themselves are built from `IngredientStatus` / `FleetReviewStatus`
 * members in `LibraryShelfUtil`.
 */
export enum LibraryShelf {
  GENERATING = 'generating',
  UNSORTED = 'unsorted',
  NEEDS_REVIEW = 'needs-review',
  APPROVED = 'approved',
  FAILED = 'failed',
  ARCHIVED = 'archived',
}

/** Display order of shelves in the Library sidebar. */
export const LIBRARY_SHELF_ORDER: readonly LibraryShelf[] = [
  LibraryShelf.GENERATING,
  LibraryShelf.UNSORTED,
  LibraryShelf.NEEDS_REVIEW,
  LibraryShelf.APPROVED,
  LibraryShelf.FAILED,
  LibraryShelf.ARCHIVED,
] as const;

/** Human labels for each shelf. */
export const LIBRARY_SHELF_LABELS: Record<LibraryShelf, string> = {
  [LibraryShelf.GENERATING]: 'Generating',
  [LibraryShelf.UNSORTED]: 'Unsorted',
  [LibraryShelf.NEEDS_REVIEW]: 'Needs review',
  [LibraryShelf.APPROVED]: 'Approved',
  [LibraryShelf.FAILED]: 'Failed',
  [LibraryShelf.ARCHIVED]: 'Archived',
};

/**
 * Library places — the non-shelf destinations in the sidebar. Unlike shelves,
 * these are not generation state: they are ownership (`isFavorite`) and
 * lifecycle (`isDeleted`) views over the same rows.
 */
export enum LibraryPlace {
  ASSETS = 'assets',
  RECENT = 'recent',
  STARRED = 'starred',
  TRASH = 'trash',
}

/** Narrow an arbitrary string to a `LibraryShelf`, or `undefined`. */
export function parseLibraryShelf(value?: unknown): LibraryShelf | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();

  return LIBRARY_SHELF_ORDER.find((shelf) => shelf === normalized);
}
