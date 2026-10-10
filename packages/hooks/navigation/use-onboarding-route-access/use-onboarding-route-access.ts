'use client';

import {
  hasAgentFirstOnboarding,
  isCloudDeployment,
} from '@genfeedai/config/deployment';
import { hasOrganizationBillingHint } from '@genfeedai/config/license';
import { useAccessState } from '@genfeedai/contexts/providers/access-state/access-state.provider';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import {
  getBrandOrganizationAccountType,
  getBrandOrganizationSlug,
} from '@genfeedai/contexts/user/brand-context/brand-context.helpers';
import { useCurrentUser } from '@genfeedai/contexts/user/user-context/user-context';
import { MemberRole } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createOrganizationAppRoute,
  getResumeStep,
  ONBOARDING_STEPS,
  parseScopedAppPath,
  resolveForcedOnboardingHref,
} from '@genfeedai/contracts/constants';
import { getPlaywrightAuthState } from '@genfeedai/helpers/auth/auth.helper';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { useFeatureFlag } from '@hooks/feature-flags/use-feature-flag/use-feature-flag';
import { useMemo } from 'react';

export function useOnboardingRouteAccess(pathname: string) {
  // Admin `agent` flag (#5468): with Agent off, onboarding takes the classic wizard.
  const isAgentModuleEnabled = useFeatureFlag('agent');
  const { isLoaded: isAuthLoaded, isSignedIn } = useAuthIdentity();
  const playwrightAuth = getPlaywrightAuthState();
  const effectiveIsAuthLoaded =
    isAuthLoaded || playwrightAuth?.isLoaded === true;
  const effectiveIsSignedIn = isSignedIn || playwrightAuth?.isSignedIn === true;
  const { currentUser, isLoading: isUserLoading } = useCurrentUser();
  const {
    accessState,
    hasCreditsRemaining,
    isLoading: isAccessStateLoading,
    isSubscribed,
    isSuperAdmin,
    needsOnboarding,
  } = useAccessState();
  const { selectedBrand, brands, isBrandScopeResolved } = useBrand();
  const hasNoBrandAccess =
    isCloudDeployment() &&
    isBrandScopeResolved &&
    brands.length === 0 &&
    Boolean(accessState?.memberRole) &&
    accessState?.memberRole !== MemberRole.OWNER &&
    accessState?.memberRole !== MemberRole.ADMIN;
  const brand = selectedBrand ?? brands[0];
  const isOnboardingRoute = pathname.startsWith('/onboarding');
  const isBillingEnabled = hasOrganizationBillingHint();

  const redirectTarget = useMemo(() => {
    if (!effectiveIsAuthLoaded) {
      return null;
    }

    if (!effectiveIsSignedIn) {
      return '/login';
    }

    if (isUserLoading || isAccessStateLoading || !currentUser) {
      return null;
    }

    // Agent-first onboarding is the /agent/onboarding conversation. Waiting on
    // accessState here deadlocks first-login users whose brand context has not
    // resolved an organizationId yet — the access query never enables, this
    // guard spins forever, and the agent surface never mounts.
    if (!accessState) {
      return null;
    }

    if (hasNoBrandAccess) return null;

    // The user record is the fresher signal right after completion: the
    // access-state snapshot can still say "needs onboarding" for up to a
    // minute. A finished user goes on to the credits check below.
    if (needsOnboarding && currentUser.isOnboardingCompleted !== true) {
      if (isOnboardingRoute) {
        return null;
      }

      if (hasAgentFirstOnboarding(isAgentModuleEnabled)) {
        const href = resolveForcedOnboardingHref({
          accountType: getBrandOrganizationAccountType(brand),
          completedSteps: currentUser.onboardingStepsCompleted,
          hasAgentFirstOnboarding: true,
          orgSlug: getBrandOrganizationSlug(brand),
        });
        return pathname === href || pathname.startsWith(`${href}/`)
          ? null
          : href;
      }

      if (isSuperAdmin || isSubscribed) {
        return null;
      }

      const completedSteps = currentUser.onboardingStepsCompleted ?? [];
      const hasCompletedAllOnboardingSteps = ONBOARDING_STEPS.every((step) =>
        completedSteps.includes(step),
      );

      if (hasCompletedAllOnboardingSteps) {
        return '/onboarding/summary';
      }

      const resumeStep = getResumeStep(currentUser.onboardingStepsCompleted);
      return `/onboarding/${resumeStep}`;
    }

    // Funnel: signup -> onboarding (never paywalled, handled above) -> use the
    // app on the onboarding credits -> paywall once the balance is spent. The
    // check reads the live balance, not "has ever had credits": every new org
    // gets the signup gift, so that durable flag would never paywall anyone.
    if (
      isBillingEnabled &&
      !isSuperAdmin &&
      !isSubscribed &&
      !hasCreditsRemaining
    ) {
      if (!hasAgentFirstOnboarding(isAgentModuleEnabled)) {
        return '/onboarding/summary';
      }

      // Agent-first has no classic summary step (the proxy bounces it back to
      // brand settings, which looped). The paywall is the organization's
      // credits and subscription pages: buy a plan or a small credit pack, and
      // nothing else renders until then. An org without brands has no brand
      // to read the slug from, so fall back to the org in the current URL.
      const orgSlug =
        getBrandOrganizationSlug(brand) || parseScopedAppPath(pathname).orgSlug;
      if (!orgSlug) {
        return null;
      }

      const paywallHrefs = [
        createOrganizationAppRoute(orgSlug, APP_ROUTES.SETTINGS.CREDITS),
        createOrganizationAppRoute(orgSlug, APP_ROUTES.SETTINGS.SUBSCRIPTION),
      ];
      const isOnPaywall = paywallHrefs.some(
        (href) => pathname === href || pathname.startsWith(`${href}/`),
      );

      return isOnPaywall ? null : paywallHrefs[0];
    }

    return null;
  }, [
    accessState,
    hasNoBrandAccess,
    brand,
    pathname,
    currentUser,
    effectiveIsAuthLoaded,
    effectiveIsSignedIn,
    hasCreditsRemaining,
    isAccessStateLoading,
    isBillingEnabled,
    isOnboardingRoute,
    isSubscribed,
    isSuperAdmin,
    isUserLoading,
    needsOnboarding,
    isAgentModuleEnabled,
  ]);

  const canRenderWithoutAccessState =
    hasAgentFirstOnboarding(isAgentModuleEnabled);

  const canRender = !(
    !effectiveIsAuthLoaded ||
    isUserLoading ||
    isAccessStateLoading ||
    !currentUser ||
    redirectTarget ||
    (!accessState && !canRenderWithoutAccessState)
  );

  return { canRender, redirectTarget };
}
