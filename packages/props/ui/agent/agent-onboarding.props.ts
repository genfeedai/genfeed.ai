export type OnboardingChecklistStatus = 'pending' | 'in-progress' | 'complete';

export interface OnboardingChecklistStep {
  id: string;
  title: string;
  description: string;
  status: OnboardingChecklistStatus;
  rewardCredits?: number;
  isClaimed?: boolean;
  isRecommended?: boolean;
  ctaHref?: string;
  ctaLabel?: string;
}

export type OnboardingBrandContextRowStatus =
  | 'done'
  | 'skipped'
  | 'now'
  | 'todo';

export interface OnboardingBrandContextRow {
  id: string;
  label: string;
  status: OnboardingBrandContextRowStatus;
  /** Credits the row pays; absent for the website row. */
  rewardCredits?: number;
  isRewardEarned?: boolean;
}

/** Live brand-context score and onboarding card progress for one brand. */
export interface OnboardingBrandContextPanel {
  /** Overall brand completeness (0-100); null until the first load. */
  score: number | null;
  creditsEarned: number;
  rows: OnboardingBrandContextRow[];
}

export interface AgentOnboardingChecklistProps {
  /** When set, the panel shows brand context instead of the journey. */
  brandContext?: OnboardingBrandContextPanel;
  steps: OnboardingChecklistStep[];
  currentStepId?: string;
  earnedCredits?: number;
  totalJourneyCredits?: number;
  completionPercent?: number;
  journeyHref?: string;
  signupGiftCredits?: number;
  totalOnboardingCreditsVisible?: number;
  /**
   * Managed credits are cloud-only, so a self-hosted install has no reward
   * economy to show. The numeric fields keep their defaults; this flag decides
   * whether the credit chrome renders at all.
   */
  isCreditRewardsVisible?: boolean;
}
