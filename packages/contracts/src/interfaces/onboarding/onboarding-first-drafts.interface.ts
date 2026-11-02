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
 * `ready`: every channel and the generated media came back.
 * `partial`: at least one channel or media asset is unavailable.
 * `unavailable`: nothing could be generated (for example no provider key on a
 * self-hosted install).
 */
export type OnboardingFirstDraftsStatus = 'ready' | 'partial' | 'unavailable';

/**
 * `needs_credits`: the organization cannot pay for this image, so none was
 * attempted. The rest of the campaign is unaffected.
 */
export type OnboardingCampaignImageStatus =
  | 'pending'
  | 'ready'
  | 'failed'
  | 'needs_credits';

/** One platform image derived from the master campaign image. */
export interface IOnboardingCampaignImage {
  aspectRatio: string;
  /** Stable slot id: `twitter`, `instagram`, `linkedin`, `tiktok-1`, `tiktok-2`. */
  id: string;
  ingredientId: string | null;
  platform: OnboardingDraftPlatform;
  status: OnboardingCampaignImageStatus;
  url: string | null;
}

export interface IOnboardingFirstDraftsResult {
  drafts: IOnboardingFirstDraft[];
  /** Platform images derived from the master, in the order they are generated. */
  campaignImages?: IOnboardingCampaignImage[];
  /** Library id of the master campaign image, attached to a post when it is scheduled. */
  imageIngredientId: string | null;
  /** The master campaign image every platform image is derived from. */
  imageUrl: string | null;
  /** Request key of the X draft, passed back to link a regeneration to it. */
  requestKey: string | null;
  status: OnboardingFirstDraftsStatus;
}

/** Server-owned onboarding outputs; reads never create or charge for content. */
export interface IOnboardingDraftRun {
  id: string;
  /** Retries left for missing campaign images; the run's own bounded allowance. */
  mediaRetriesRemaining: number;
  status: 'running' | 'complete' | 'interrupted';
  result: IOnboardingFirstDraftsResult | null;
  verdicts: Record<string, 'up' | 'down'>;
}
