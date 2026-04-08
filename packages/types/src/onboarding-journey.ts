export type OnboardingJourneyMissionId =
  | 'complete_company_info'
  | 'connect_social_account'
  | 'generate_first_image'
  | 'generate_first_video'
  | 'publish_first_post';

export interface IOnboardingJourneyMissionState {
  id: OnboardingJourneyMissionId;
  isCompleted: boolean;
  rewardClaimed: boolean;
  rewardCredits: number;
  completedAt?: string | Date | null;
}

export interface IOnboardingJourneyMissionDefinition {
  id: OnboardingJourneyMissionId;
  label: string;
  description: string;
  whyItMatters: string;
  rewardCredits: number;
  ctaLabel: string;
  ctaHref: string;
}

export const ONBOARDING_SIGNUP_GIFT_CREDITS = 100;

export const ONBOARDING_JOURNEY_MISSION_ORDER: OnboardingJourneyMissionId[] = [
  'complete_company_info',
  'generate_first_image',
  'connect_social_account',
  'generate_first_video',
  'publish_first_post',
];

export const ONBOARDING_JOURNEY_MISSIONS: IOnboardingJourneyMissionDefinition[] =
  [
    {
      ctaHref: '/onboarding/brand',
      ctaLabel: 'Continue onboarding',
      description:
        'Tell the agent what you create so it can build your brand profile and generate a relevant first image.',
      id: 'complete_company_info',
      label: 'Complete company info',
      rewardCredits: 25,
      whyItMatters:
        'Better company context gives GenFeed better prompts, voice, and visual direction.',
    },
    {
      ctaHref: '/onboarding/providers',
      ctaLabel: 'Configure providers',
      description:
        'Generate your first image right away from the context you just shared.',
      id: 'generate_first_image',
      label: 'Generate your first image',
      rewardCredits: 15,
      whyItMatters:
        'Your first image proves the workflow works and gives the agent a concrete artifact to build on.',
    },
    {
      ctaHref: '/onboarding/providers',
      ctaLabel: 'Configure providers',
      description:
        'Connect your first social account so GenFeed can tailor content to real channels.',
      id: 'connect_social_account',
      label: 'Connect a social account',
      rewardCredits: 10,
      whyItMatters:
        'Connected channels unlock platform-aware workflows and publishing.',
    },
    {
      ctaHref: '/onboarding/providers',
      ctaLabel: 'Configure providers',
      description:
        'Generate your first video to unlock richer content creation.',
      id: 'generate_first_video',
      label: 'Generate your first video',
      rewardCredits: 20,
      whyItMatters:
        'Video is a higher-value content path and a stronger activation milestone.',
    },
    {
      ctaHref: '/onboarding/providers',
      ctaLabel: 'Configure providers',
      description:
        'Publish your first post to complete the journey and claim the final reward.',
      id: 'publish_first_post',
      label: 'Publish your first post',
      rewardCredits: 30,
      whyItMatters:
        'Publishing closes the loop from setup to real output and proves time-to-value.',
    },
  ];

export const ONBOARDING_JOURNEY_TOTAL_CREDITS =
  ONBOARDING_JOURNEY_MISSIONS.reduce(
    (total, mission) => total + mission.rewardCredits,
    0,
  );

export const ONBOARDING_TOTAL_VISIBLE_CREDITS =
  ONBOARDING_SIGNUP_GIFT_CREDITS + ONBOARDING_JOURNEY_TOTAL_CREDITS;
