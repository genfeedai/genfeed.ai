'use client';

import { useOnboarding } from '@contexts/onboarding/onboarding-context';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { useCurrentUser } from '@contexts/user/user-context/user-context';
import { ONBOARDING_MAX_DRAFT_ROUNDS } from '@genfeedai/contracts/constants';
import type {
  IOnboardingDraftContext,
  IOnboardingFirstDraftsResult,
  IOnboardingScanResult,
} from '@genfeedai/contracts/interfaces';
import { resolveSignupBrandDomain } from '@genfeedai/helpers';
import type {
  FirstDraftsError,
  FirstDraftsPhase,
  FirstDraftsState,
  FirstDraftsWorkingStep,
} from '@genfeedai/props/onboarding/first-drafts.props';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { logger } from '@services/core/logger.service';
import { OnboardingService } from '@services/onboarding/onboarding.service';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ONBOARDING_STORAGE_KEYS } from '@/lib/onboarding/onboarding-access.util';
import { useCompleteOnboarding } from '../../_expert/use-complete-onboarding.hook';
import { toOnboardingLink } from './first-drafts.util';

export function useFirstDrafts(): FirstDraftsState {
  const { getToken } = useAuthIdentity();
  const { brandId, isBrandScopeResolved } = useBrand();
  const { currentUser, isLoading } = useCurrentUser();
  const { handleStepComplete, steps } = useOnboarding();
  const completeOnboarding = useCompleteOnboarding();
  const searchParams = useSearchParams();
  const { replace } = useRouter();

  const [url, setUrl] = useState('');
  const [phase, setPhase] = useState<FirstDraftsPhase>('url');
  const [workingStep, setWorkingStep] =
    useState<FirstDraftsWorkingStep>('scanning');
  const [scan, setScan] = useState<IOnboardingScanResult | null>(null);
  const [result, setResult] = useState<IOnboardingFirstDraftsResult | null>(
    null,
  );
  const [round, setRound] = useState(0);
  const [error, setError] = useState<FirstDraftsError | null>(null);
  const [isContinuing, setIsContinuing] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const hasPrefilledRef = useRef(false);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    [],
  );

  const getService = useCallback(async () => {
    const token = await resolveAuthToken(getToken);
    if (!token) throw new Error('Not authenticated');
    return OnboardingService.getInstance(token);
  }, [getToken]);

  const draft = useCallback(
    async (
      service: OnboardingService,
      context: IOnboardingDraftContext | undefined,
      signal: AbortSignal,
    ) => {
      setWorkingStep('drafting');
      const next = await service.generateDrafts(
        brandId,
        {
          ...(context ? { context } : {}),
          ...(result?.requestKey
            ? { previousRequestKey: result.requestKey }
            : {}),
        },
        signal,
      );
      if (signal.aborted) return;
      setResult(next);
      setRound((current) => current + 1);
      setPhase('review');
    },
    [brandId, result?.requestKey],
  );

  const onStart = useCallback(
    (link?: string) => {
      const value = toOnboardingLink(link ?? url);
      if (!brandId || !value) return;
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setError(null);
      setPhase('working');
      setWorkingStep('scanning');
      void (async () => {
        try {
          const service = await getService();
          const scanned = await service.scanBrand(
            brandId,
            value,
            controller.signal,
          );
          if (controller.signal.aborted) return;
          setScan(scanned);
          // A link we could not read goes straight to the brand-context round.
          if (scanned.status !== 'scanned') {
            setPhase('context');
            return;
          }
          await draft(service, undefined, controller.signal);
        } catch (caught) {
          if (controller.signal.aborted) return;
          logger.error('Failed to create first drafts', caught);
          setError('generate');
          setPhase('url');
        }
      })();
    },
    [brandId, draft, getService, url],
  );

  const onSubmitContext = useCallback(
    (context: IOnboardingDraftContext) => {
      if (!brandId) return;
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setError(null);
      setPhase('working');
      void (async () => {
        try {
          await draft(await getService(), context, controller.signal);
        } catch (caught) {
          if (controller.signal.aborted) return;
          logger.error('Failed to regenerate first drafts', caught);
          setError('generate');
          setPhase('context');
        }
      })();
    },
    [brandId, draft, getService],
  );

  const onContinue = useCallback(() => {
    if (isContinuing) return;
    setIsContinuing(true);
    setError(null);
    // The Expert path continues into its own steps; everyone else is done.
    const finish =
      steps.length > 1 ? handleStepComplete('brand') : completeOnboarding();
    void finish.catch((caught: unknown) => {
      logger.error('Failed to finish onboarding', caught);
      setError('continue');
      setIsContinuing(false);
    });
  }, [completeOnboarding, handleStepComplete, isContinuing, steps.length]);

  // A finished user has nothing to set up here.
  const isOnboardingCompleted = currentUser?.isOnboardingCompleted === true;
  useEffect(() => {
    if (isOnboardingCompleted) replace('/');
  }, [isOnboardingCompleted, replace]);

  // A work-email domain is already a good guess: start without asking.
  useEffect(() => {
    if (
      hasPrefilledRef.current ||
      isOnboardingCompleted ||
      isLoading ||
      !isBrandScopeResolved ||
      !brandId ||
      !currentUser
    )
      return;
    hasPrefilledRef.current = true;
    const resolved = resolveSignupBrandDomain({
      email: currentUser.email,
      requestedDomain:
        searchParams.get('brandDomain') ??
        localStorage.getItem(ONBOARDING_STORAGE_KEYS.brandDomain),
    });
    if (!resolved.websiteUrl) return;
    setUrl(resolved.websiteUrl);
    onStart(resolved.websiteUrl);
  }, [
    brandId,
    currentUser,
    isBrandScopeResolved,
    isLoading,
    isOnboardingCompleted,
    onStart,
    searchParams,
  ]);

  return {
    canRetry: round < ONBOARDING_MAX_DRAFT_ROUNDS,
    isReady: isBrandScopeResolved && Boolean(brandId),
    error,
    isContinuing,
    isScanFailed: scan?.status === 'failed',
    onContinue,
    onNotRight: () => setPhase('context'),
    onSkipLink: () => setPhase('context'),
    onStart,
    onSubmitContext,
    onUrlChange: setUrl,
    phase,
    result,
    round,
    scan,
    url,
    workingStep,
  };
}
