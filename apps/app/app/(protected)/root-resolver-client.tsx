'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { getBrandOrganizationAccountType } from '@contexts/user/brand-context/brand-context.helpers';
import { useCurrentUser } from '@contexts/user/user-context/user-context';
import {
  hasAgentFirstOnboarding,
  isCloudDeployment,
} from '@genfeedai/config/deployment';
import { ButtonVariant, MemberRole } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createBrandAppRoute,
  createOrganizationAppRoute,
  hasCompletedBrandOnboardingStep,
  ONBOARDING_STEPS,
  resolveForcedOnboardingHref,
} from '@genfeedai/contracts/constants';
import { useFeatureFlag } from '@hooks/feature-flags/use-feature-flag/use-feature-flag';
import { useAccessState } from '@providers/access-state/access-state.provider';
import { Alert, AlertDescription, AlertTitle } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { appendSearchParamsToHref } from '@/lib/navigation/operator-shell';
import { resolveOperationalHomeScope } from './home/operational-home.helpers';

const WORKSPACE_RESOLUTION_TIMEOUT_MS = 8_000;

export default function ProtectedRootResolver() {
  const translate = useTranslations('pages.organizationLanding');
  // Admin `agent` flag (#5468): with Agent off, onboarding takes the classic wizard.
  const isAgentModuleEnabled = useFeatureFlag('agent');
  const {
    brands,
    isReady,
    isBrandScopeResolved,
    organizationId,
    refreshBrands,
    selectedBrand,
  } = useBrand();
  const { currentUser, isLoading: isCurrentUserLoading } = useCurrentUser();
  const { accessState, isLoading: isAccessStateLoading } = useAccessState();
  const { replace } = useRouter();
  const searchParams = useSearchParams();
  const hasNoBrandAccess =
    isCloudDeployment() &&
    isBrandScopeResolved &&
    brands.length === 0 &&
    Boolean(accessState?.memberRole) &&
    accessState?.memberRole !== MemberRole.OWNER &&
    accessState?.memberRole !== MemberRole.ADMIN;
  const hasStartedRef = useRef(false);
  const [needsWorkspaceAction, setNeedsWorkspaceAction] = useState(false);

  useEffect(() => {
    if (
      !hasAgentFirstOnboarding(isAgentModuleEnabled) ||
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
    isAgentModuleEnabled,
  ]);

  useEffect(() => {
    if (
      isAccessStateLoading ||
      isCurrentUserLoading ||
      !isReady ||
      !currentUser ||
      hasNoBrandAccess ||
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
      const agentOrgSlug = resolveOperationalHomeScope({
        accessOrganizationId: accessState?.organizationId,
        brands,
        organizationId,
        selectedBrand,
      }).orgSlug;
      if (
        hasAgentFirstOnboarding(isAgentModuleEnabled) &&
        hasCompletedBrandOnboardingStep(completedSteps) &&
        !agentOrgSlug
      ) {
        setNeedsWorkspaceAction(true);
        return;
      }

      replace(
        resolveForcedOnboardingHref({
          accountType: getBrandOrganizationAccountType(
            selectedBrand ?? brands[0],
          ),
          completedSteps,
          hasAgentFirstOnboarding:
            hasAgentFirstOnboarding(isAgentModuleEnabled),
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
    hasNoBrandAccess,
    brands,
    currentUser,
    isCurrentUserLoading,
    isAccessStateLoading,
    isReady,
    organizationId,
    replace,
    searchParams,
    selectedBrand,
    isAgentModuleEnabled,
  ]);

  if (hasNoBrandAccess)
    return (
      <p className="px-6 py-12 text-muted-foreground" role="status">
        {translate('noBrandAccess')}
      </p>
    );

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
            {translate('workspaceSetupTitle')}
          </AlertTitle>
          <AlertDescription>
            <p>
              {translate(
                workspaceActionOrgSlug
                  ? 'workspaceSetupWithBrand'
                  : 'workspaceSetupDescription',
              )}
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
                {translate('retryWorkspace')}
              </Button>
              {workspaceActionOrgSlug ? (
                <Button asChild variant={ButtonVariant.GHOST}>
                  <Link href={APP_ROUTES.ONBOARDING.BRAND}>
                    {translate('continueSetup')}
                  </Link>
                </Button>
              ) : null}
            </div>
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  return null;
}
