/**
 * A workflow a platform superadmin pinned to every organization's templates
 * Featured row (#5511). Carries display fields only; the org-facing read adds
 * the sanitized graph. Nothing identifying the source organization, its
 * users or its brands crosses the boundary.
 */
export interface IFeaturedWorkflowSummary {
  id: string;
  /** `null` when the source workflow has no label; the UI shows its own fallback. */
  label: string | null;
  description: string | null;
  thumbnail: string | null;
  /** Position in the Featured row, 1 = first; derived from pin order. */
  featuredRank: number;
}

/** Body of every `/admin/featured-workflows` response: the pins, in order. */
export interface IFeaturedWorkflowPinsResponse {
  data: IFeaturedWorkflowSummary[];
}
