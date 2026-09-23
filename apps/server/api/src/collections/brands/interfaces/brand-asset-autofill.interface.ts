import type { BrandKitSourceType } from '@genfeedai/contracts/interfaces';

export interface BrandAssetAutofillScope {
  brandId: string;
  organizationId: string;
  userId: string;
}

export interface BrandAssetAutofillCandidate {
  label: string;
  /** Required by the importer when the URL carries no image extension. */
  mimeType?: string;
  sourceType: BrandKitSourceType;
  url: string;
}

export interface BrandAssetCandidateOptions {
  /** Resolves page-relative scraped URLs. */
  baseUrl?: string;
  /** Type to declare when the URL has no image extension. */
  extensionlessMimeType?: string;
}

export interface SocialProfileAssets {
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  platform: string;
}
