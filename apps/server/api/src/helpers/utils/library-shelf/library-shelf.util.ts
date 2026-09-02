import { CategoryPrismaUtil } from '@api/helpers/utils/category-prisma/category-prisma.util';
import {
  FleetReviewStatus,
  IngredientStatus,
  LibraryShelf,
  parseLibraryShelf,
  QualityStatus,
} from '@genfeedai/contracts';

/**
 * Statuses an asset can hold and still belong in the Library's default
 * "All assets" view. Archived, rejected, and failed assets are reachable only
 * through their own shelf — they are state, not inventory.
 */
const LIBRARY_DEFAULT_STATUSES: readonly IngredientStatus[] = [
  IngredientStatus.DRAFT,
  IngredientStatus.PROCESSING,
  IngredientStatus.UPLOADED,
  IngredientStatus.GENERATED,
  IngredientStatus.VALIDATED,
] as const;

/**
 * Statuses that count as usable inventory on the Unsorted shelf. A failed or
 * archived asset with no folder is not "unsorted" — it has its own shelf.
 */
const UNSORTED_STATUSES: readonly IngredientStatus[] = [
  IngredientStatus.DRAFT,
  IngredientStatus.UPLOADED,
  IngredientStatus.GENERATED,
] as const;

/**
 * Shelf → Prisma `where` fragment. Each shelf is a saved query over the same
 * `ingredients` rows, so the fragments compose freely with the folder, category,
 * and search filters the caller ANDs alongside them.
 *
 * Every fragment is non-empty. `BaseService.normalizeWhere` drops empty objects
 * inside an `OR` because an empty branch matches every row, which would widen
 * the tenant scope — the shelf spec asserts no branch can ever be empty.
 */
const SHELF_FILTERS: Record<LibraryShelf, Record<string, unknown>> = {
  [LibraryShelf.GENERATING]: { status: IngredientStatus.PROCESSING },
  [LibraryShelf.UNSORTED]: {
    folderId: null,
    status: { in: [...UNSORTED_STATUSES] },
  },
  [LibraryShelf.NEEDS_REVIEW]: {
    OR: [
      {
        reviewStatus: {
          in: [FleetReviewStatus.PENDING, FleetReviewStatus.NEEDS_REVISION],
        },
      },
      { qualityStatus: QualityStatus.NEEDS_REVIEW },
    ],
  },
  [LibraryShelf.APPROVED]: {
    OR: [
      { status: IngredientStatus.VALIDATED },
      { reviewStatus: FleetReviewStatus.APPROVED },
    ],
  },
  [LibraryShelf.FAILED]: { status: IngredientStatus.FAILED },
  [LibraryShelf.ARCHIVED]: {
    status: {
      in: [IngredientStatus.ARCHIVED, IngredientStatus.REJECTED],
    },
  },
};

/**
 * LibraryShelfUtil — builds the generation-state axis of the Library list query.
 *
 * The Library has three orthogonal axes: **type** (`category`), **shelf**
 * (`status` / `reviewStatus` / `qualityStatus`), and **folder** (`folderId`).
 * This util owns the shelf axis; `IngredientFilterUtil` owns the folder axis and
 * `CollectionFilterUtil.buildCategoryFilter` owns the type axis.
 *
 * @example
 * const shelf = LibraryShelfUtil.buildShelfFilter(query.shelf);
 * const status = LibraryShelfUtil.buildStatusFilter(query.status, query.shelf);
 * // where: { AND: [{ organizationId, isDeleted }, shelf, status, ...] }
 */
export class LibraryShelfUtil {
  /**
   * Build the Prisma `where` fragment for a shelf.
   *
   * Returns `{}` for an absent or unrecognised shelf so callers can spread it
   * unconditionally.
   */
  static buildShelfFilter(shelf?: unknown): Record<string, unknown> {
    const parsed = parseLibraryShelf(shelf);

    if (!parsed) {
      return {};
    }

    return SHELF_FILTERS[parsed];
  }

  /**
   * Build the status fragment for the Library list.
   *
   * A selected shelf owns the status axis outright — otherwise the Archived
   * shelf would be ANDed with a default list that excludes archived rows and
   * always return nothing. With no shelf, an explicit status list wins and the
   * fallback is `LIBRARY_DEFAULT_STATUSES`.
   */
  static buildStatusFilter(
    status?: Array<IngredientStatus | string>,
    shelf?: unknown,
  ): Record<string, unknown> {
    if (parseLibraryShelf(shelf)) {
      return {};
    }

    const explicit = (status ?? [])
      .map((value) => CategoryPrismaUtil.toIngredientStatus(value))
      .filter((value): value is NonNullable<typeof value> => Boolean(value));

    return {
      status: {
        in: explicit.length > 0 ? explicit : [...LIBRARY_DEFAULT_STATUSES],
      },
    };
  }

  /**
   * Build the fragment for the Starred place. `isFavorite: false` is not a
   * destination in the Library — "not starred" is just All assets — so only an
   * explicit `true` narrows the query.
   */
  static buildPlaceFilter(isFavorite?: boolean): Record<string, unknown> {
    return isFavorite === true ? { isFavorite: true } : {};
  }

  /** The statuses the Library shows when no shelf and no filter are selected. */
  static get defaultStatuses(): readonly IngredientStatus[] {
    return LIBRARY_DEFAULT_STATUSES;
  }
}
