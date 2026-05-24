export { deriveBrandNameFromDomain } from '@/lib/onboarding/onboarding-access.util';

export type PostSignupIntent =
  | { kind: 'plan-checkout'; stripePriceId: string }
  | { kind: 'credits-checkout'; credits: number }
  | { kind: 'auto-brand'; domain: string }
  | { kind: 'manual-brand' };

interface ResolvePostSignupIntentInput {
  personalEmailDomains: readonly string[];
  primaryEmail?: string | null;
  selectedCredits?: string | null;
  selectedPlan?: string | null;
}

function extractDomain(email?: string | null): string | null {
  if (!email?.includes('@')) {
    return null;
  }

  const domain = email.split('@')[1]?.trim().toLowerCase();
  return domain || null;
}

export function parseSelectedCredits(
  rawCredits?: string | null,
): number | null {
  const normalizedCredits = rawCredits?.trim();

  if (!normalizedCredits || !/^\d+$/.test(normalizedCredits)) {
    return null;
  }

  const parsed = Number.parseInt(normalizedCredits, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export function buildOnboardingResumeHref(
  resumeStep: string,
  brandDomain?: string | null,
): string {
  if (resumeStep === 'brand' && brandDomain?.trim()) {
    return '/onboarding/brand?auto=true';
  }

  return `/onboarding/${resumeStep}`;
}

export function resolvePostSignupIntent(
  input: ResolvePostSignupIntentInput,
): PostSignupIntent {
  const selectedPlan = input.selectedPlan?.trim();
  if (selectedPlan) {
    return { kind: 'plan-checkout', stripePriceId: selectedPlan };
  }

  const credits = parseSelectedCredits(input.selectedCredits);
  if (credits) {
    return { credits, kind: 'credits-checkout' };
  }

  const domain = extractDomain(input.primaryEmail);
  if (!domain) {
    return { kind: 'manual-brand' };
  }

  const isPersonalEmail = input.personalEmailDomains.includes(domain);
  if (isPersonalEmail) {
    return { kind: 'manual-brand' };
  }

  return { domain, kind: 'auto-brand' };
}
