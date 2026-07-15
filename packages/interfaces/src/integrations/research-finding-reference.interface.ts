export const RESEARCH_FINDING_REFERENCE_KINDS = [
  'research-ad-connected-google',
  'research-ad-connected-meta',
  'research-ad-public-google',
  'research-ad-public-meta',
  'research-source-post',
  'research-trend-content',
  'research-trend-hashtag',
  'research-trend-sound',
  'research-trend-video',
] as const;

export type ResearchFindingReferenceKind =
  (typeof RESEARCH_FINDING_REFERENCE_KINDS)[number];

/** A typed selector for one finding returned by an authorized Research query. */
export interface ResearchFindingReference {
  readonly id: string;
  readonly kind: ResearchFindingReferenceKind;
}

/**
 * A Research selector bound to the effective server-authorized tenant and
 * brand. It carries no copied finding content or execution authority.
 */
export interface ScopedResearchFindingReference
  extends ResearchFindingReference {
  readonly brandId: string;
  readonly organizationId: string;
}
