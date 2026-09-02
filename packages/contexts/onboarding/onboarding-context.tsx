'use client';

import { hasAgentFirstOnboarding } from '@genfeedai/config/deployment';
import { clearClientProtectedBootstrapCache } from '@genfeedai/contexts/providers/protected-bootstrap/client-protected-bootstrap';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { getBrandOrganizationSlug } from '@genfeedai/contexts/user/brand-context/brand-context.helpers';
import { useCurrentUser } from '@genfeedai/contexts/user/user-context/user-context';
import type { OnboardingStepKey } from '@genfeedai/contracts/constants';
import {
  APP_ROUTES,
  ONBOARDING_STEP_LABELS,
  ONBOARDING_STEPS,
  resolveOnboardingContinueHref,
} from '@genfeedai/contracts/constants';
import type { IOnboardingContextValue } from '@genfeedai/contracts/interfaces';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import type { OnboardingProviderProps } from '@genfeedai/props/onboarding/onboarding-provider.props';
import { logger } from '@genfeedai/services/core/logger.service';
import type { UpdateUserOnboardingPayload } from '@genfeedai/services/onboarding/user-onboarding.service';
import { UserOnboardingService } from '@genfeedai/services/onboarding/user-onboarding.service';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { usePathname, useRouter } from 'next/navigation';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

const OnboardingContext = createContext<IOnboardingContextValue | null>(null);

export function useOnboarding(): IOnboardingContextValue {
  const ctx = use(OnboardingContext);
  if (!ctx) {
    throw new Error('useOnboarding must be used within OnboardingProvider');
  }
  return ctx;
}

export default function OnboardingProvider({
  children,
}: OnboardingProviderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { getToken } = useAuthIdentity();
  const { currentUser, isLoading, refetchUser } = useCurrentUser();
  const { brands, selectedBrand } = useBrand();
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Derive current step from URL — success page bypasses step tracking
  const currentStepKey = useMemo<OnboardingStepKey>(() => {
    const segment = pathname.split('/').pop();
    if (segment && ONBOARDING_STEPS.includes(segment as OnboardingStepKey)) {
      return segment as OnboardingStepKey;
    }
    return 'brand';
  }, [pathname]);

  const currentStepIndex = Math.max(
    0,
    ONBOARDING_STEPS.indexOf(currentStepKey),
  );

  useEffect(() => {
    if (!isLoading && currentUser) {
      setInitialized(true);
    }
  }, [isLoading, currentUser]);

  const getService = useCallback(async () => {
    const token = await resolveAuthToken(getToken);
    if (!token) {
      throw new Error('Not authenticated');
    }
    return UserOnboardingService.getInstance(token);
  }, [getToken]);

  const saveProgress = useCallback(
    async (payload: UpdateUserOnboardingPayload) => {
      if (!currentUser) {
        return;
      }
      setSaving(true);
      try {
        const service = await getService();
        await service.updateOnboarding(currentUser.id, payload);
        // A saved step must not re-serve the 60s client bootstrap snapshot —
        // that is what left `onboardingStepsCompleted` stale and bounced a
        // first-login operator back to `/onboarding/brand` from the agent
        // handoff the step just unlocked.
        clearClientProtectedBootstrapCache();
        await refetchUser();
      } catch (error) {
        logger.error('Failed to save onboarding progress', error);
        throw error;
      } finally {
        setSaving(false);
      }
    },
    [currentUser, getService, refetchUser],
  );

  const agentOnboardingOrgSlug = useMemo(
    () =>
      getBrandOrganizationSlug(selectedBrand) ||
      getBrandOrganizationSlug(brands[0]) ||
      null,
    [brands, selectedBrand],
  );

  const handleStepComplete = useCallback(
    async (
      stepKey: OnboardingStepKey,
      extraPayload?: Partial<UpdateUserOnboardingPayload>,
    ) => {
      const completedSteps = [...(currentUser?.onboardingStepsCompleted ?? [])];
      if (!completedSteps.includes(stepKey)) {
        completedSteps.push(stepKey);
      }

      const payload: UpdateUserOnboardingPayload = {
        onboardingStepsCompleted: completedSteps,
        ...extraPayload,
      };

      await saveProgress(payload);

      // Every other caller of the onboarding href helpers supplies the org
      // slug so the agent handoff lands on the canonical
      // `/${orgSlug}/~/agent/onboarding` route directly. Without it the bare
      // path only resolves through a proxy canonicalization hop.
      const nextHref = resolveOnboardingContinueHref({
        completedStep: stepKey,
        hasAgentFirstOnboarding: hasAgentFirstOnboarding(),
        orgSlug: agentOnboardingOrgSlug,
      });

      if (nextHref === APP_ROUTES.ROOT) {
        router.replace(nextHref);
        return;
      }

      router.push(nextHref);
    },
    [agentOnboardingOrgSlug, currentUser, saveProgress, router],
  );

  const handleSkip = useCallback(
    async (stepKey: OnboardingStepKey) => {
      await handleStepComplete(stepKey);
    },
    [handleStepComplete],
  );

  const handleBack = useCallback(() => {
    if (currentStepIndex > 0) {
      const prevStep = ONBOARDING_STEPS[currentStepIndex - 1];
      router.push(`/onboarding/${prevStep}`);
    }
  }, [currentStepIndex, router]);

  const stepLabels = useMemo(
    () =>
      hasAgentFirstOnboarding()
        ? [ONBOARDING_STEP_LABELS.brand]
        : ONBOARDING_STEPS.map((key) => ONBOARDING_STEP_LABELS[key]),
    [],
  );

  const value = useMemo<IOnboardingContextValue>(
    () => ({
      currentStepIndex,
      currentStepKey,
      handleBack,
      handleSkip,
      handleStepComplete,
      saving,
      stepLabels,
    }),
    [
      currentStepIndex,
      currentStepKey,
      handleBack,
      handleSkip,
      handleStepComplete,
      saving,
      stepLabels,
    ],
  );

  if (isLoading || !initialized) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="size-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!currentUser) {
    return null;
  }

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}
