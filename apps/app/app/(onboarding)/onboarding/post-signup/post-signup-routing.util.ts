import type { PostSignupIntent } from '@genfeedai/props/onboarding/post-signup-routing.props';

export type { PostSignupIntent } from '@genfeedai/props/onboarding/post-signup-routing.props';

export {
  deriveBrandNameFromDomain,
  hasPaidPlanIntent,
  isFreePlanHandoff,
} from '@/lib/onboarding/onboarding-access.util';

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

export { buildOnboardingResumeHref } from '@genfeedai/contracts/constants';

export function appendCheckoutReturnParams(
  href: string,
  checkoutKind: Extract<
    PostSignupIntent['kind'],
    'credits-checkout' | 'plan-checkout'
  >,
): string {
  const url = new URL(href, 'https://app.genfeed.ai');
  url.searchParams.set('checkout', 'completed');
  url.searchParams.set(
    'checkoutKind',
    checkoutKind === 'plan-checkout' ? 'plan' : 'credits',
  );

  return `${url.pathname}${url.search}${url.hash}`;
}
