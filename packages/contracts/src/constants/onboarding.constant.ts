import { OrganizationCategory } from '..';
import { APP_ROUTES, createOrganizationAppRoute } from './routes.constant';

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
 * Wizard steps for an account type on the current surface. Agent-first
 * surfaces (Cloud, Community) never render the provider/summary steps, so the
 * Expert Path there is `brand → positioning → corpus → first-system`.
 */
export function resolveOnboardingSteps(input: {
  accountType?: OrganizationCategory | string | null;
  hasAgentFirstOnboarding: boolean;
}): readonly OnboardingStepKey[] {
  if (isExpertAccountType(input.accountType)) {
    return input.hasAgentFirstOnboarding
      ? EXPERT_ONBOARDING_STEPS.slice(0, 3)
      : EXPERT_ONBOARDING_STEPS;
  }

  return input.hasAgentFirstOnboarding
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

/**
 * `/onboarding/brand` is the shared brand-setup step for every surface
 * (Cloud browser, Community, Desktop-cloud, Desktop-local). Skip still
 * completes the onboarding *gate*; this route stays reachable so the
 * operator can come back and run brand setup later.
 */
export function isSharedBrandOnboardingPath(pathname: string): boolean {
  return (
    pathname === APP_ROUTES.ONBOARDING.BRAND ||
    pathname === APP_ROUTES.ONBOARDING.ROOT
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

export function buildOnboardingResumeHref(
  resumeStep: string,
  brandDomain?: string | null,
): string {
  if (resumeStep === 'brand' && brandDomain?.trim()) {
    return `${APP_ROUTES.ONBOARDING.BRAND}?auto=true`;
  }

  return `${APP_ROUTES.ONBOARDING.ROOT}/${resumeStep}`;
}

function resolveAgentOnboardingHref(orgSlug?: string | null): string {
  return orgSlug
    ? createOrganizationAppRoute(orgSlug, APP_ROUTES.AGENT.ONBOARDING)
    : APP_ROUTES.AGENT.ONBOARDING;
}

/**
 * Where to send the operator after they finish a wizard step.
 * Cloud / Community leave the brand form for the agent conversation;
 * Desktop continues the classic wizard so both surfaces share one brand page.
 */
export function resolveOnboardingContinueHref(input: {
  accountType?: OrganizationCategory | string | null;
  completedStep: OnboardingStepKey;
  hasAgentFirstOnboarding: boolean;
  orgSlug?: string | null;
}): string {
  const isExpert = isExpertAccountType(input.accountType);
  if (
    !isExpert &&
    input.completedStep === 'brand' &&
    input.hasAgentFirstOnboarding
  ) {
    return resolveAgentOnboardingHref(input.orgSlug);
  }

  // Agent-first surfaces walk a cloud operator through brand only, but the
  // wizard tail stays reachable on its own (Desktop, and an operator who comes
  // back to it). Sequencing the classic path off the resolved list dropped
  // `providers → summary` there, so only the Expert Path — whose tail is its
  // own first-system screen — sequences off the resolved steps.
  const steps = isExpert ? resolveOnboardingSteps(input) : ONBOARDING_STEPS;
  const stepIndex = steps.indexOf(input.completedStep);
  if (stepIndex >= 0 && stepIndex < steps.length - 1) {
    const nextStep = steps[stepIndex + 1];
    return `${APP_ROUTES.ONBOARDING.ROOT}/${nextStep}`;
  }

  if (isExpert) {
    return APP_ROUTES.ONBOARDING.FIRST_SYSTEM;
  }

  return APP_ROUTES.ROOT;
}

/**
 * Forced first-run destination while onboarding is still incomplete.
 * Completed users are not sent here — they re-enter `/onboarding/brand`
 * themselves (journey card, `/onboarding` replay).
 */
export function resolveForcedOnboardingHref(input: {
  accountType?: OrganizationCategory | string | null;
  brandDomain?: string | null;
  completedSteps?: readonly string[] | null;
  hasAgentFirstOnboarding: boolean;
  orgSlug?: string | null;
}): string {
  if (isExpertAccountType(input.accountType)) {
    const steps = resolveOnboardingSteps(input);
    const completedSteps = input.completedSteps ?? [];
    if (steps.every((step) => completedSteps.includes(step))) {
      return APP_ROUTES.ONBOARDING.FIRST_SYSTEM;
    }

    return buildOnboardingResumeHref(
      getResumeStep(completedSteps, steps),
      input.brandDomain,
    );
  }

  if (input.hasAgentFirstOnboarding) {
    if (hasCompletedBrandOnboardingStep(input.completedSteps)) {
      return resolveAgentOnboardingHref(input.orgSlug);
    }

    return buildOnboardingResumeHref('brand', input.brandDomain);
  }

  return buildOnboardingResumeHref(
    getResumeStep(input.completedSteps ?? undefined),
    input.brandDomain,
  );
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
