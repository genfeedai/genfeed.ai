'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  getBrandOrganizationAccountType,
  getBrandOrganizationSlug,
} from '@contexts/user/brand-context/brand-context.helpers';
import { useCurrentUser } from '@contexts/user/user-context/user-context';
import { hasAgentFirstOnboarding } from '@genfeedai/config/deployment';
import {
  APP_ROUTES,
  createBrandAppRoute,
  ONBOARDING_STEPS,
  resolveForcedOnboardingHref,
} from '@genfeedai/contracts/constants';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useFeatureFlag } from '@hooks/feature-flags/use-feature-flag/use-feature-flag';
import { OrganizationsService } from '@services/organization/organizations.service';
import Spinner from '@ui/primitives/spinner';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Root /onboarding page — redirects to the first concrete onboarding step.
 */
export default function OnboardingRootPage() {
  // Admin `agent` flag (#5468): with Agent off, onboarding takes the classic wizard.
  const isAgentModuleEnabled = useFeatureFlag('agent');
  const { currentUser, isLoading } = useCurrentUser();
  const { selectedBrand, brands, isBrandScopeResolved } = useBrand();
  const { getToken } = useAuthIdentity();
  const { replace } = useRouter();

  useEffect(() => {
    if (isLoading || !currentUser || !isBrandScopeResolved) {
      return;
    }

    const completedSteps = currentUser.onboardingStepsCompleted ?? [];
    const hasCompletedAllOnboardingSteps =
      currentUser.isOnboardingCompleted === true ||
      ONBOARDING_STEPS.every((step) => completedSteps.includes(step));

    const isAgentFirst = hasAgentFirstOnboarding(isAgentModuleEnabled);
    const brand = selectedBrand ?? brands[0];
    if (hasCompletedAllOnboardingSteps) {
      replace(
        isAgentFirst
          ? getBrandOrganizationSlug(brand) && brand?.slug
            ? createBrandAppRoute(
                getBrandOrganizationSlug(brand),
                brand.slug,
                '/settings/kit',
              )
            : '/settings/kit'
          : APP_ROUTES.ONBOARDING.BRAND,
      );
      return;
    }
    const controller = new AbortController();
    async function redirect() {
      let orgSlug = getBrandOrganizationSlug(brand);
      if (isAgentFirst && !orgSlug) {
        const token = await resolveAuthToken(getToken);
        if (token && !controller.signal.aborted) {
          const organizations = await OrganizationsService.getInstance(token)
            .getMyOrganizations()
            .catch(() => []);
          orgSlug =
            (organizations.find((org) => org.isActive) ?? organizations[0])
              ?.slug ?? '';
        }
      }
      if (!controller.signal.aborted)
        replace(
          resolveForcedOnboardingHref({
            accountType: getBrandOrganizationAccountType(brand),
            completedSteps,
            hasAgentFirstOnboarding: isAgentFirst,
            orgSlug,
          }),
        );
    }
    void redirect().catch(() => {
      if (!controller.signal.aborted) replace(APP_ROUTES.AGENT.ONBOARDING);
    });
    return () => controller.abort();
  }, [
    currentUser,
    isLoading,
    replace,
    isAgentModuleEnabled,
    selectedBrand,
    brands,
    isBrandScopeResolved,
    getToken,
  ]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Spinner className="size-6 text-foreground" />
    </div>
  );
}
