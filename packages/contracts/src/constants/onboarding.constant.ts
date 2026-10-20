import { OrganizationCategory } from '..';
import type { OnboardingDraftPlatform } from '../interfaces/onboarding/onboarding-first-drafts.interface';
import { APP_ROUTES } from './routes.constant';

/**
 * Ordered onboarding gate steps — used by the wizard, guard, and resume logic.
 * Every account type completes these; the Expert Path inserts its own steps
 * between `brand` and `providers` (see `EXPERT_ONBOARDING_STEPS`).
 */
export const ONBOARDING_STEPS = ['brand', 'providers', 'summary'] as const;

/**
 * Expert Path wizard order: positioning interview and corpus ingest run right
 * after brand setup, then the shared gate steps.
 */
export const EXPERT_ONBOARDING_STEPS = [
  'brand',
  'positioning',
  'corpus',
  'providers',
  'summary',
] as const;

export type OnboardingStepKey = (typeof EXPERT_ONBOARDING_STEPS)[number];

/** Steps an expert may skip; skipped steps resurface as workspace tasks. */
export const EXPERT_SKIPPABLE_ONBOARDING_STEPS = [
  'positioning',
  'corpus',
] as const satisfies readonly OnboardingStepKey[];

export const ONBOARDING_STEP_LABELS: Record<OnboardingStepKey, string> = {
  brand: 'Brand',
  corpus: 'Corpus',
  positioning: 'Positioning',
  providers: 'Providers',
  summary: 'Summary',
};

export function isExpertAccountType(
  accountType?: OrganizationCategory | string | null,
): boolean {
  return accountType === OrganizationCategory.EXPERT;
}

/**
 * Wizard steps for an account type on the current surface. The web app
 * (Cloud, Community) collects the brand and shows the first drafts on one page,
 * so a non-expert never sees the provider/summary steps there and the Expert
 * Path is `brand → positioning → corpus → first-system`. Desktop keeps the
 * classic provider/summary wizard.
 */
export function resolveOnboardingSteps(input: {
  accountType?: OrganizationCategory | string | null;
  hasSingleStepOnboarding: boolean;
}): readonly OnboardingStepKey[] {
  if (isExpertAccountType(input.accountType)) {
    return input.hasSingleStepOnboarding
      ? EXPERT_ONBOARDING_STEPS.slice(0, 3)
      : EXPERT_ONBOARDING_STEPS;
  }

  return input.hasSingleStepOnboarding
    ? ONBOARDING_STEPS.slice(0, 1)
    : ONBOARDING_STEPS;
}

export function isOnboardingStepKey(
  value: string | null | undefined,
): value is OnboardingStepKey {
  return (
    !!value && (EXPERT_ONBOARDING_STEPS as readonly string[]).includes(value)
  );
}

export function hasCompletedBrandOnboardingStep(
  completedSteps?: readonly string[] | null,
): boolean {
  return Boolean(completedSteps?.includes('brand'));
}

/**
 * Returns the first onboarding step the user has not yet completed.
 * Falls back to 'brand' when no steps have been completed.
 */
export function getResumeStep(
  completedSteps?: readonly string[],
  steps: readonly OnboardingStepKey[] = ONBOARDING_STEPS,
): OnboardingStepKey {
  if (!completedSteps || completedSteps.length === 0) {
    return 'brand';
  }

  for (const step of steps) {
    if (!completedSteps.includes(step)) {
      return step;
    }
  }

  // When all steps are completed but completion metadata is stale,
  // resume at the final step instead of restarting from brand.
  return steps[steps.length - 1] ?? 'summary';
}

export function buildOnboardingResumeHref(resumeStep: string): string {
  return `${APP_ROUTES.ONBOARDING.ROOT}/${resumeStep}`;
}

/**
 * Where to send the operator after they finish a wizard step. The last step of
 * the resolved list leaves onboarding for the workspace; an Expert finishing
 * their last wizard step lands on the first-system screen.
 */
export function resolveOnboardingContinueHref(input: {
  accountType?: OrganizationCategory | string | null;
  completedStep: OnboardingStepKey;
  hasSingleStepOnboarding: boolean;
}): string {
  const steps = resolveOnboardingSteps(input);
  const stepIndex = steps.indexOf(input.completedStep);
  if (stepIndex >= 0 && stepIndex < steps.length - 1) {
    const nextStep = steps[stepIndex + 1];
    return `${APP_ROUTES.ONBOARDING.ROOT}/${nextStep}`;
  }

  if (isExpertAccountType(input.accountType)) {
    return APP_ROUTES.ONBOARDING.FIRST_SYSTEM;
  }

  return APP_ROUTES.ROOT;
}

/**
 * Forced first-run destination while onboarding is still incomplete.
 * Completed users review their guide in settings. Experts resume positioning
 * once the brand step is done.
 */
export function resolveForcedOnboardingHref(input: {
  accountType?: OrganizationCategory | string | null;
  completedSteps?: readonly string[] | null;
  hasSingleStepOnboarding: boolean;
}): string {
  const steps = resolveOnboardingSteps(input);
  const completedSteps = input.completedSteps ?? [];
  if (
    isExpertAccountType(input.accountType) &&
    steps.every((step) => completedSteps.includes(step))
  ) {
    return APP_ROUTES.ONBOARDING.FIRST_SYSTEM;
  }

  return buildOnboardingResumeHref(getResumeStep(completedSteps, steps));
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

/**
 * Expert Path workspace tasks. They lead the setup card for `EXPERT`
 * organizations until the underlying state exists, so a skipped onboarding
 * step (or a failed first-system generation) is the first thing the expert
 * sees in the workspace.
 */
export const EXPERT_SETUP_CARD_STEPS = [
  {
    description: 'Answer the positioning interview',
    key: 'positioning',
    label: 'Positioning',
  },
  {
    description: 'Add talks, newsletters, or call notes',
    key: 'corpus',
    label: 'Corpus',
  },
  {
    description: 'Generate and review your first content plan',
    key: 'first-system',
    label: 'First content system',
  },
] as const;

export type SetupCardStepKey =
  | (typeof SETUP_CARD_STEPS)[number]['key']
  | (typeof EXPERT_SETUP_CARD_STEPS)[number]['key'];

/** Channels the first run drafts one post for, in display order. */
export const ONBOARDING_DRAFT_PLATFORMS: readonly OnboardingDraftPlatform[] = [
  'twitter',
  'instagram',
  'tiktok',
  'linkedin',
];

/** Rounds of drafts a new user sees: the first pass and one retry with context. */
export const ONBOARDING_MAX_DRAFT_ROUNDS = 2;

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
  'proton.me',
  'googlemail.com',
  'yahoo.co.uk',
  'hotmail.co.uk',
  'outlook.fr',
  'hotmail.fr',
  'gmx.de',
  'gmx.net',
  'tuta.com',
  'tutamail.com',
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
