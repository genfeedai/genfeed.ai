import type { AvatarTwinStatus } from '../../enums/avatar-twin.enum';

/**
 * A digital twin the person records of themselves in the app. The avatar,
 * consent record and voice live in the workspace's own provider account;
 * this is Genfeed's view of the enrollment.
 */
export interface IAvatarTwin {
  id: string;
  name: string;
  status: AvatarTwinStatus;
  brandId: string | null;
  providerGroupId: string | null;
  providerLookId: string | null;
  supportedEngines: string[];
  previewImageUrl: string | null;
  voiceId: string | null;
  /** When the current consent link stops working; null before one is issued. */
  consentLinkExpiresAt: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  readyAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A consent page the person opens on the provider's site. */
export interface IAvatarTwinConsentLink {
  consentUrl: string;
  expiresAt: string;
}
