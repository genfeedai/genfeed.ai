export type MediaDeliveryPurpose =
  | 'preview'
  | 'public-share'
  | 'public-og'
  | 'public-social';

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
  purpose: MediaDeliveryPurpose;
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
