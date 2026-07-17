'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { useCurrentUser } from '@contexts/user/user-context/user-context';
import { isSaaS } from '@genfeedai/config/deployment';
import {
  APP_ROUTES,
  createBrandAppRoute,
  createOrganizationAppRoute,
  getResumeStep,
  ONBOARDING_STEPS,
} from '@genfeedai/constants';
import { useAccessState } from '@providers/access-state/access-state.provider';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

function getBrandOrganizationSlug(
  brand: ReturnType<typeof useBrand>['selectedBrand'],
): string {
  const organization = brand?.organization;

  if (
    organization &&
    typeof organization === 'object' &&
    'slug' in organization &&
    typeof organization.slug === 'string'
  ) {
    return organization.slug;
  }

  return '';
}

export default function ProtectedRootResolver() {
  const { brandId, brands, isReady, organizationId, selectedBrand } =
    useBrand();
  const { currentUser, isLoading: isCurrentUserLoading } = useCurrentUser();
  const { accessState, isLoading: isAccessStateLoading } = useAccessState();
  const { replace } = useRouter();
  const hasStartedRef = useRef(false);
  const [statusMessage, setStatusMessage] = useState(
    'Checking workspace state...',
  );

  useEffect(() => {
    if (
      isAccessStateLoading ||
      isCurrentUserLoading ||
      !isReady ||
      !currentUser ||
      hasStartedRef.current
    ) {
      return;
    }

    hasStartedRef.current = true;
    const completedSteps = currentUser.onboardingStepsCompleted ?? [];
    const hasCompletedOnboarding =
      currentUser.isOnboardingCompleted === true ||
      ONBOARDING_STEPS.every((step) => completedSteps.includes(step));

    if (!hasCompletedOnboarding) {
      setStatusMessage('Opening onboarding...');
      const agentOrgSlug =
        getBrandOrganizationSlug(selectedBrand) ||
        getBrandOrganizationSlug(brands[0]);
      if (isSaaS()) {
        if (!agentOrgSlug) {
          hasStartedRef.current = false;
          setStatusMessage('Preparing your agent workspace...');
          return;
        }

        replace(
          createOrganizationAppRoute(agentOrgSlug, APP_ROUTES.AGENT.ONBOARDING),
        );
        return;
      }

      replace(`/onboarding/${getResumeStep(completedSteps)}`);
      return;
    }

    const hasOrganization =
      (typeof organizationId === 'string' && organizationId.length > 0) ||
      (typeof accessState?.organizationId === 'string' &&
        accessState.organizationId.length > 0);
    const hasSelectedBrand =
      (typeof brandId === 'string' && brandId.length > 0) ||
      (typeof accessState?.brandId === 'string' &&
        accessState.brandId.length > 0);

    let nextMessage: string;
    let nextUrl: string;

    if (hasOrganization && hasSelectedBrand) {
      const orgSlug = getBrandOrganizationSlug(selectedBrand);
      const brandSlug = selectedBrand?.slug;

      if (orgSlug && brandSlug) {
        nextMessage = 'Opening workspace...';
        nextUrl = createBrandAppRoute(
          orgSlug,
          brandSlug,
          '/workspace/overview',
        );
      } else {
        const fallbackOrgSlug = getBrandOrganizationSlug(brands[0]);
        nextMessage =
          hasOrganization && fallbackOrgSlug
            ? 'Opening organization...'
            : 'Opening onboarding...';
        nextUrl =
          hasOrganization && fallbackOrgSlug
            ? `/${fallbackOrgSlug}/~/overview`
            : '/onboarding';
      }
    } else {
      const fallbackOrgSlug = getBrandOrganizationSlug(brands[0]);
      nextMessage =
        hasOrganization && fallbackOrgSlug
          ? 'Opening organization...'
          : 'Opening onboarding...';
      nextUrl =
        hasOrganization && fallbackOrgSlug
          ? `/${fallbackOrgSlug}/~/overview`
          : '/onboarding';
    }

    if (isSaaS() && nextUrl === '/onboarding') {
      hasStartedRef.current = false;
      setStatusMessage('Preparing your agent workspace...');
      return;
    }

    setStatusMessage(nextMessage);
    replace(nextUrl);
  }, [
    accessState,
    brandId,
    brands,
    currentUser,
    isCurrentUserLoading,
    isAccessStateLoading,
    isReady,
    organizationId,
    replace,
    selectedBrand,
  ]);

  return <PageLoadingState className="bg-background" message={statusMessage} />;
}
