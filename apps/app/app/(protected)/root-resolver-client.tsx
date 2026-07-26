'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { getBrandOrganizationSlug } from '@contexts/user/brand-context/brand-context.helpers';
import { useCurrentUser } from '@contexts/user/user-context/user-context';
import { isSaaS } from '@genfeedai/config/deployment';
import {
  APP_ROUTES,
  createOrganizationAppRoute,
  getResumeStep,
  ONBOARDING_STEPS,
} from '@genfeedai/constants';
import { ButtonVariant } from '@genfeedai/enums';
import { useAccessState } from '@providers/access-state/access-state.provider';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Alert, AlertDescription, AlertTitle } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import OperationalHomeContent from './home/content';
import { resolveOperationalHomeScope } from './home/operational-home.helpers';

const WORKSPACE_RESOLUTION_TIMEOUT_MS = 8_000;

export default function ProtectedRootResolver() {
  const { brands, isReady, organizationId, refreshBrands, selectedBrand } =
    useBrand();
  const { currentUser, isLoading: isCurrentUserLoading } = useCurrentUser();
  const { accessState, isLoading: isAccessStateLoading } = useAccessState();
  const { replace } = useRouter();
  const hasStartedRef = useRef(false);
  const [statusMessage, setStatusMessage] = useState(
    'Checking workspace state...',
  );
  const [isHomeReady, setIsHomeReady] = useState(false);
  const [needsWorkspaceAction, setNeedsWorkspaceAction] = useState(false);

  useEffect(() => {
    if (
      !isSaaS() ||
      isReady ||
      isAccessStateLoading ||
      isCurrentUserLoading ||
      !currentUser ||
      isHomeReady ||
      needsWorkspaceAction
    ) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setNeedsWorkspaceAction(true);
    }, WORKSPACE_RESOLUTION_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [
    currentUser,
    isAccessStateLoading,
    isCurrentUserLoading,
    isHomeReady,
    isReady,
    needsWorkspaceAction,
  ]);

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
          setNeedsWorkspaceAction(true);
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

    const scope = resolveOperationalHomeScope({
      accessOrganizationId: accessState?.organizationId,
      brands,
      organizationId,
      selectedBrand,
    });

    if (scope.organizationId) {
      setStatusMessage('Opening operational home...');
      setIsHomeReady(true);
      return;
    }

    if (isSaaS()) {
      setNeedsWorkspaceAction(true);
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

  if (needsWorkspaceAction) {
    return (
      <main className="mx-auto flex min-h-[60vh] w-full max-w-3xl items-center px-4 py-10 sm:px-6">
        <Alert>
          <AlertTitle aria-level={1} role="heading">
            Workspace setup needs attention
          </AlertTitle>
          <AlertDescription>
            <p>
              Genfeed could not resolve an active organization yet. Retry the
              workspace bootstrap or continue setup from brand settings.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  setNeedsWorkspaceAction(false);
                  hasStartedRef.current = false;
                  void refreshBrands();
                }}
                variant={ButtonVariant.SECONDARY}
                withWrapper={false}
              >
                Retry workspace
              </Button>
              <Button asChild variant={ButtonVariant.GHOST}>
                <Link href={APP_ROUTES.ONBOARDING.ROOT}>Continue setup</Link>
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  return <PageLoadingState className="bg-background" message={statusMessage} />;
}
