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

export interface AgentOnboardingChecklistProps {
  steps: OnboardingChecklistStep[];
  currentStepId?: string;
  earnedCredits?: number;
  totalJourneyCredits?: number;
  completionPercent?: number;
  journeyHref?: string;
  signupGiftCredits?: number;
  totalOnboardingCreditsVisible?: number;
}
