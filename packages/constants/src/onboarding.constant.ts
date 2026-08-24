import { APP_ROUTES, createOrganizationAppRoute } from './routes.constant';

/**
 * Ordered onboarding step keys — used by the wizard, guard, and resume logic.
 */
export const ONBOARDING_STEPS = ['brand', 'providers', 'summary'] as const;

export type OnboardingStepKey = (typeof ONBOARDING_STEPS)[number];

export const ONBOARDING_STEP_LABELS: Record<OnboardingStepKey, string> = {
  brand: 'Brand',
  providers: 'Providers',
  summary: 'Summary',
};

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
): OnboardingStepKey {
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
  return 'summary';
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
  completedStep: OnboardingStepKey;
  hasAgentFirstOnboarding: boolean;
  orgSlug?: string | null;
}): string {
  if (input.completedStep === 'brand' && input.hasAgentFirstOnboarding) {
    return resolveAgentOnboardingHref(input.orgSlug);
  }

  const stepIndex = ONBOARDING_STEPS.indexOf(input.completedStep);
  if (stepIndex >= 0 && stepIndex < ONBOARDING_STEPS.length - 1) {
    const nextStep = ONBOARDING_STEPS[stepIndex + 1];
    return `${APP_ROUTES.ONBOARDING.ROOT}/${nextStep}`;
  }

  return APP_ROUTES.ROOT;
}

/**
 * Forced first-run destination while onboarding is still incomplete.
 * Completed users are not sent here — they re-enter `/onboarding/brand`
 * themselves (journey card, `/onboarding` replay).
 */
export function resolveForcedOnboardingHref(input: {
  brandDomain?: string | null;
  completedSteps?: readonly string[] | null;
  hasAgentFirstOnboarding: boolean;
  orgSlug?: string | null;
}): string {
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
