/** A piece of prepared content pinned into a preview at mint time. */
export interface IContentPreviewItemRef {
  kind: 'POST';
  id: string;
}

/**
 * Operator view of a preview. The raw token is only present on the mint
 * response and is never stored or returned again.
 */
export interface IContentPreview {
  id: string;
  warmupAccountId: string;
  items: IContentPreviewItemRef[];
  expiresAt: string;
  revokedAt?: string;
  claimedAt?: string;
  firstViewedAt?: string;
  lastViewedAt?: string;
  viewCount: number;
  ctaClickCount: number;
  createdAt: string;
  updatedAt: string;
  /** Only on the mint response. */
  token?: string;
  /** Only on the mint response. The lead's locked profile: `<website>/u/<handle>/invite/<token>`. */
  url?: string;
}

export interface IContentPreviewMintRequest {
  /** Posts to pin. Defaults to the starter set recorded on the workspace. */
  postIds?: string[];
  /** Lifetime in days. Defaults to 14. */
  expiresInDays?: number;
}

export interface IContentPreviewExtendRequest {
  /** Days added from now (or from the current expiry when still in the future). */
  extendByDays: number;
}

export type IPublicContentPreviewMediaKind = 'image' | 'video';

export interface IPublicContentPreviewMedia {
  kind: IPublicContentPreviewMediaKind;
  /** Short-lived signed URL. */
  url: string;
  expiresAt?: string;
}

export interface IPublicContentPreviewItem {
  /** Position-based id, unrelated to database ids. */
  id: string;
  platform: string;
  text: string;
  media: IPublicContentPreviewMedia[];
}

/** Reviewed brand context only. Absent fields are omitted, never empty. */
export interface IPublicContentPreviewBrand {
  name: string;
  description?: string;
  tone?: string;
  style?: string;
  audience?: string[];
  values?: string[];
  messagingPillars?: string[];
  primaryColor?: string;
  secondaryColor?: string;
  logoUrl?: string;
  /** Short-lived signed URL, 3:1. Present only when the operator accepted the banner. */
  bannerUrl?: string;
}

/** Everything a logged-out visitor can read. Allowlist only. */
export interface IPublicContentPreview {
  id: string;
  expiresAt: string;
  /** The prepared brand's profile handle; the invite page answers only under it. */
  handle: string;
  brand: IPublicContentPreviewBrand;
  items: IPublicContentPreviewItem[];
}
