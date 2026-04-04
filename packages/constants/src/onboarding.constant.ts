/**
 * Ordered onboarding step keys — used by the wizard, guard, and resume logic.
 */
export const ONBOARDING_STEPS = ['brand', 'plan'] as const;

export type OnboardingStepKey = (typeof ONBOARDING_STEPS)[number];

export const ONBOARDING_STEP_LABELS: Record<OnboardingStepKey, string> = {
  brand: 'Brand',
  plan: 'Plan',
};

/**
 * Returns the first onboarding step the user has not yet completed.
 * Falls back to 'brand' when no steps have been completed.
 */
export function getResumeStep(completedSteps?: string[]): OnboardingStepKey {
  if (!completedSteps || completedSteps.length === 0) {
    return 'brand';
  }

  for (const step of ONBOARDING_STEPS) {
    if (!completedSteps.includes(step)) {
      return step;
    }
  }

  // When all steps are completed but completion metadata is stale,
  // resume at the final step instead of restarting from brand.
  return 'plan';
}

/**
 * Steps tracked by the sidebar setup card (post-onboarding).
 * Preferences and platform connections are completed at the user's own pace.
 */
export const SETUP_CARD_STEPS = [
  {
    description: 'Choose what you want to create',
    key: 'preferences',
    label: 'Content types',
  },
  {
    description: 'Connect Instagram, TikTok, etc.',
    key: 'platforms',
    label: 'Social accounts',
  },
] as const;

export type SetupCardStepKey = (typeof SETUP_CARD_STEPS)[number]['key'];

/**
 * Personal email domains that require manual brand URL input.
 * Corporate email domains auto-extract brand from the domain.
 */
export const PERSONAL_EMAIL_DOMAINS = [
  'gmail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'icloud.com',
  'protonmail.com',
  'aol.com',
  'mail.com',
  'zoho.com',
  'yandex.com',
  'gmx.com',
  'live.com',
  'msn.com',
  'pm.me',
  'tutanota.com',
  'fastmail.com',
  'hey.com',
  'me.com',
  'mac.com',
] as const;
