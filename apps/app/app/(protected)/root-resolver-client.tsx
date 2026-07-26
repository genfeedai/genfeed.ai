'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  getBrandOrganizationId,
  getBrandOrganizationSlug,
} from '@contexts/user/brand-context/brand-context.helpers';
import { useCurrentUser } from '@contexts/user/user-context/user-context';
import { isSaaS } from '@genfeedai/config/deployment';
import {
  APP_ROUTES,
  createOrganizationAppRoute,
  getResumeStep,
  ONBOARDING_STEPS,
} from '@genfeedai/constants';
import { useAccessState } from '@providers/access-state/access-state.provider';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import OperationalHomeContent from './home/content';

export default function ProtectedRootResolver() {
  const { brands, isReady, organizationId, selectedBrand } = useBrand();
  const { currentUser, isLoading: isCurrentUserLoading } = useCurrentUser();
  const { accessState, isLoading: isAccessStateLoading } = useAccessState();
  const { replace } = useRouter();
  const hasStartedRef = useRef(false);
  const [statusMessage, setStatusMessage] = useState(
    'Checking workspace state...',
  );
  const [isHomeReady, setIsHomeReady] = useState(false);

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
    const scopedOrganizationId =
      organizationId || accessState?.organizationId || '';
    const fallbackBrand = [selectedBrand, ...brands].find(
      (brand) =>
        brand && getBrandOrganizationId(brand) === scopedOrganizationId,
    );
    const fallbackOrgSlug = getBrandOrganizationSlug(fallbackBrand);
    const hasBrand =
      typeof fallbackBrand?.slug === 'string' && fallbackBrand.slug.length > 0;

    if (hasOrganization && fallbackOrgSlug && hasBrand) {
      setStatusMessage('Opening operational home...');
      setIsHomeReady(true);
      return;
    }

    if (isSaaS()) {
      hasStartedRef.current = false;
      setStatusMessage('Preparing your agent workspace...');
      return;
    }

    setStatusMessage('Opening onboarding...');
    replace(APP_ROUTES.ONBOARDING.ROOT);
  }, [
    accessState,
    brands,
    currentUser,
    isCurrentUserLoading,
    isAccessStateLoading,
    isReady,
    organizationId,
    replace,
    selectedBrand,
  ]);

  if (isHomeReady) {
    return <OperationalHomeContent />;
  }

  return <PageLoadingState className="bg-background" message={statusMessage} />;
}
