import type { OnboardingFunnelEmailClass } from './onboarding-funnel.interface';

/** One saved first-run post and what the member said about it. */
export interface IOnboardingDraftsReviewDraft {
  platform: string;
  /** Reasons given with a "not for me" verdict; empty when none were given. */
  reasons: string[];
  /** The saved text, exactly as the member saw it. */
  text: string;
  /** "I'd post this" is `up`, "Not for me" is `down`, no tap is `null`. */
  verdict: 'down' | 'up' | null;
}

/** The newest first-run campaign of one organization. */
export interface IOnboardingDraftsReviewRun {
  brandName: string | null;
  createdAt: string;
  drafts: IOnboardingDraftsReviewDraft[];
  draftsStatus: string | null;
  emailClass: OnboardingFunnelEmailClass;
  hasMasterImage: boolean;
  organizationId: string;
}

/**
 * Platform-admin read of what new organizations were shown at the end of the
 * first-run onboarding. Carries the saved copy so a bad run can be read, and
 * the owner's email class, never the address.
 */
export interface IOnboardingDraftsReview {
  generatedAt: string;
  runs: IOnboardingDraftsReviewRun[];
  since: string;
  windowDays: number;
}
