export type MediaDeliveryPurpose =
  | 'preview'
  | 'public-share'
  | 'public-og'
  | 'public-social';

/** Purposes that have a persisted derivative; `preview` is the live original. */
export type MediaVariantPurpose = Exclude<MediaDeliveryPurpose, 'preview'>;

export interface MediaDeliveryScope {
  organizationId: string;
  userId: string;
  brandId?: string;
}

export interface MediaDeliveryGrant {
  id: string;
  url: string | null;
  expiresAt: string | null;
  state: 'READY' | 'PENDING' | 'FAILED' | 'UNSUPPORTED';
  purpose: MediaDeliveryPurpose | 'original-download';
}

export interface MediaDeliveryJobData {
  organizationId: string;
  ingredientId: string;
  sourceIdentity: string;
  purpose: MediaVariantPurpose;
}

export interface MediaResourceProjection {
  ingredientId: string;
  metadataId: string | null;
  grant: MediaDeliveryGrant;
}

export interface MediaAssetProjection {
  assetId: string;
  url: string | null;
}

export interface MediaPreviewState {
  sourceIdentity: string;
  grant: MediaDeliveryGrant | null;
}
