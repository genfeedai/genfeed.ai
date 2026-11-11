/**
 * Where a Library asset stands in a teammate review (#9948), summed over every
 * review request on it. UI filter keys / API values, not persisted statuses:
 * the persisted state lives on each review task (`Task.reviewState`).
 *
 * Precedence when reviewers disagree: one reviewer asking for changes puts the
 * asset in `changes_requested`; otherwise an unanswered request keeps it
 * `in_review`; an asset is `approved` only once every request is approved.
 */
export enum LibraryReviewState {
  IN_REVIEW = 'in_review',
  APPROVED = 'approved',
  CHANGES_REQUESTED = 'changes_requested',
}

/** Display order of review states in the Library Filters menu. */
export const LIBRARY_REVIEW_STATE_ORDER: readonly LibraryReviewState[] = [
  LibraryReviewState.IN_REVIEW,
  LibraryReviewState.CHANGES_REQUESTED,
  LibraryReviewState.APPROVED,
];

/** Narrow an arbitrary string to a `LibraryReviewState`, or `undefined`. */
export function parseLibraryReviewState(
  value?: unknown,
): LibraryReviewState | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();

  return LIBRARY_REVIEW_STATE_ORDER.find((state) => state === normalized);
}
