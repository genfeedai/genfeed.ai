import type { SignupPrefillSummary } from './signup-prefill.interface';

/** Channels the first run drafts one post for. */
export type OnboardingDraftPlatform =
  | 'twitter'
  | 'instagram'
  | 'tiktok'
  | 'linkedin';

/** Tone nudge from the "doesn't look right" round. `keep` leaves the scanned voice. */
export type OnboardingDraftTone = 'keep' | 'casual' | 'professional';

/** Brand context collected when the first drafts do not look right. */
export interface IOnboardingDraftContext {
  audience?: string;
  goals?: string[];
  offer?: string;
  tone?: OnboardingDraftTone;
}

export type OnboardingScanStatus = 'scanned' | 'failed';

export interface IOnboardingScanResult {
  /** Only set when the scan failed; one of the stable scan failure codes. */
  reason?: string;
  status: OnboardingScanStatus;
  summary?: SignupPrefillSummary;
}

export interface IOnboardingFirstDraft {
  isProvisional: boolean;
  platform: OnboardingDraftPlatform;
  postId: string;
  receiptId: string;
  requestKey: string;
  text: string;
}

/**
 * `ready`: every channel and the image came back.
 * `partial`: at least one channel is missing or the image failed.
 * `unavailable`: nothing could be generated (for example no provider key on a
 * self-hosted install).
 */
export type OnboardingFirstDraftsStatus = 'ready' | 'partial' | 'unavailable';

export interface IOnboardingFirstDraftsResult {
  drafts: IOnboardingFirstDraft[];
  /** Library id of the shared image, attached to a post when it is scheduled. */
  imageIngredientId: string | null;
  /** The one image shared by the X, Instagram and LinkedIn drafts. */
  imageUrl: string | null;
  /** Request key of the X draft, passed back to link a regeneration to it. */
  requestKey: string | null;
  status: OnboardingFirstDraftsStatus;
}
