import {
  FleetReviewStatus,
  IngredientStatus,
  LibraryShelf,
  QualityStatus,
} from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';

/** Statuses that count as usable inventory on the Unsorted shelf. */
const UNSORTED_STATUSES: readonly IngredientStatus[] = [
  IngredientStatus.DRAFT,
  IngredientStatus.UPLOADED,
  IngredientStatus.GENERATED,
] as const;

const ARCHIVED_STATUSES: readonly IngredientStatus[] = [
  IngredientStatus.ARCHIVED,
  IngredientStatus.REJECTED,
] as const;

const REVIEW_PENDING_STATUSES: readonly string[] = [
  FleetReviewStatus.PENDING,
  FleetReviewStatus.NEEDS_REVISION,
] as const;

/**
 * Client mirror of `LibraryShelfUtil`'s predicates, for labelling a single
 * asset without a round trip.
 *
 * The server's shelves are saved queries and overlap by design — an approved
 * asset with no folder matches both Approved and Unsorted. The inspector shows
 * one badge, so this resolves in lifecycle order and returns the first match:
 * terminal states first, then review, then the "nobody has filed it" fallback.
 * Keep this order in step with `SHELF_FILTERS` on the server.
 */
export function getIngredientShelf(
  ingredient: IIngredient,
): LibraryShelf | null {
  const { folderId, qualityStatus, reviewStatus, status } = ingredient;

  if (status === IngredientStatus.PROCESSING) {
    return LibraryShelf.GENERATING;
  }

  if (status === IngredientStatus.FAILED) {
    return LibraryShelf.FAILED;
  }

  if (ARCHIVED_STATUSES.includes(status)) {
    return LibraryShelf.ARCHIVED;
  }

  const hasPendingReview =
    (reviewStatus ? REVIEW_PENDING_STATUSES.includes(reviewStatus) : false) ||
    qualityStatus === QualityStatus.NEEDS_REVIEW;

  if (hasPendingReview) {
    return LibraryShelf.NEEDS_REVIEW;
  }

  if (
    status === IngredientStatus.VALIDATED ||
    reviewStatus === FleetReviewStatus.APPROVED
  ) {
    return LibraryShelf.APPROVED;
  }

  if (!folderId && UNSORTED_STATUSES.includes(status)) {
    return LibraryShelf.UNSORTED;
  }

  return null;
}
