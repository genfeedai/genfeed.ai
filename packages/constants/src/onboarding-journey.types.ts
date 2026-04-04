export type OnboardingJourneyMissionId =
  | 'complete_company_info'
  | 'connect_social_account'
  | 'generate_first_image'
  | 'generate_first_video'
  | 'publish_first_post';

export interface IOnboardingJourneyMissionState {
  id: OnboardingJourneyMissionId;
  isCompleted: boolean;
  rewardCredits: number;
  rewardClaimed: boolean;
  completedAt?: string | Date | null;
}

export interface IOnboardingJourneyMissionDefinition {
  id: OnboardingJourneyMissionId;
  label: string;
  description: string;
  rewardCredits: number;
  ctaHref: string;
  ctaLabel: string;
  whyItMatters: string;
}
