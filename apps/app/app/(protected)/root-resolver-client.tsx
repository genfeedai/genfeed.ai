'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { useCurrentUser } from '@contexts/user/user-context/user-context';
import { hasAgentFirstOnboarding } from '@genfeedai/config/deployment';
import {
  APP_ROUTES,
  createBrandAppRoute,
  createOrganizationAppRoute,
  hasCompletedBrandOnboardingStep,
  ONBOARDING_STEPS,
  resolveForcedOnboardingHref,
} from '@genfeedai/constants';
import { ButtonVariant } from '@genfeedai/enums';
import { useAccessState } from '@providers/access-state/access-state.provider';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Alert, AlertDescription, AlertTitle } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { appendSearchParamsToHref } from '@/lib/navigation/operator-shell';
import { resolveOperationalHomeScope } from './home/operational-home.helpers';

const WORKSPACE_RESOLUTION_TIMEOUT_MS = 8_000;

export default function ProtectedRootResolver() {
  const { brands, isReady, organizationId, refreshBrands, selectedBrand } =
    useBrand();
  const { currentUser, isLoading: isCurrentUserLoading } = useCurrentUser();
  const { accessState, isLoading: isAccessStateLoading } = useAccessState();
  const { replace } = useRouter();
  const searchParams = useSearchParams();
  const hasStartedRef = useRef(false);
  const [statusMessage, setStatusMessage] = useState(
    'Checking workspace state...',
  );
  const [needsWorkspaceAction, setNeedsWorkspaceAction] = useState(false);

  useEffect(() => {
    if (
      !hasAgentFirstOnboarding() ||
      isReady ||
      isAccessStateLoading ||
      isCurrentUserLoading ||
      !currentUser ||
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
      const agentOrgSlug = resolveOperationalHomeScope({
        accessOrganizationId: accessState?.organizationId,
        brands,
        organizationId,
        selectedBrand,
      }).orgSlug;
      if (
        hasAgentFirstOnboarding() &&
        hasCompletedBrandOnboardingStep(completedSteps) &&
        !agentOrgSlug
      ) {
        setNeedsWorkspaceAction(true);
        return;
      }

      replace(
        resolveForcedOnboardingHref({
          completedSteps,
          hasAgentFirstOnboarding: hasAgentFirstOnboarding(),
          orgSlug: agentOrgSlug,
        }),
      );
      return;
    }

    const scope = resolveOperationalHomeScope({
      accessOrganizationId: accessState?.organizationId,
      brands,
      organizationId,
      selectedBrand,
    });

    if (scope.organizationId && scope.orgSlug) {
      setStatusMessage('Opening your workspace...');
      const nextSearchParams = new URLSearchParams(searchParams.toString());
      // The permanent shell no longer accepts thread identity in query state.
      // Root bootstrap preserves task/checkout handoff params while dropping
      // stale shell-only state that cannot be authorized at the root.
      nextSearchParams.delete('overlay');
      nextSearchParams.delete('overlayRef');
      nextSearchParams.delete('thread');
      const workspaceHref = scope.brandSlug
        ? createBrandAppRoute(
            scope.orgSlug,
            scope.brandSlug,
            APP_ROUTES.WORKSPACE.OVERVIEW,
          )
        : createOrganizationAppRoute(
            scope.orgSlug,
            APP_ROUTES.WORKSPACE.OVERVIEW,
          );
      replace(appendSearchParamsToHref(workspaceHref, nextSearchParams));
      return;
    }

    setNeedsWorkspaceAction(true);
  }, [
    accessState,
    brands,
    currentUser,
    isCurrentUserLoading,
    isAccessStateLoading,
    isReady,
    organizationId,
    replace,
    searchParams,
    selectedBrand,
  ]);

  if (needsWorkspaceAction) {
    // A root bootstrap without a routable slug must never widen into whichever
    // unrelated organization happens to own the first loaded brand.
    const workspaceActionOrgSlug = resolveOperationalHomeScope({
      accessOrganizationId: accessState?.organizationId,
      brands,
      organizationId,
      selectedBrand,
    }).orgSlug;

    return (
      <main className="mx-auto flex min-h-[60vh] w-full max-w-3xl items-center px-4 py-10 sm:px-6">
        <Alert>
          <AlertTitle aria-level={1} role="heading">
            Workspace setup needs attention
          </AlertTitle>
          <AlertDescription>
            <p>
              Genfeed could not resolve an active organization yet. Retry the
              workspace bootstrap
              {workspaceActionOrgSlug ? ' or continue brand setup.' : '.'}
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
              {workspaceActionOrgSlug ? (
                <Button asChild variant={ButtonVariant.GHOST}>
                  <Link href={APP_ROUTES.ONBOARDING.BRAND}>Continue setup</Link>
                </Button>
              ) : null}
            </div>
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  return <PageLoadingState className="bg-background" message={statusMessage} />;
}
