'use client';
import { useOnboarding } from '@contexts/onboarding/onboarding-context';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { useCurrentUser } from '@contexts/user/user-context/user-context';
import {
  APP_ROUTES,
  ONBOARDING_MAX_DRAFT_ROUNDS,
} from '@genfeedai/contracts/constants';
import type {
  IOnboardingDraftContext,
  IOnboardingDraftRun,
  IOnboardingFirstDraft,
  IOnboardingFirstDraftsResult,
  IOnboardingScanResult,
} from '@genfeedai/contracts/interfaces';
import { resolveSignupBrandDomain } from '@genfeedai/helpers';
import type {
  FirstDraftsError,
  FirstDraftsPhase,
  FirstDraftsState,
  FirstDraftsWorkingStep,
  FirstDraftVerdict,
} from '@genfeedai/props/onboarding/first-drafts.props';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { BrandedGenerationReceiptsService } from '@services/ai/branded-generation-receipts.service';
import { logger } from '@services/core/logger.service';
import { OnboardingService } from '@services/onboarding/onboarding.service';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ONBOARDING_STORAGE_KEYS } from '@/lib/onboarding/onboarding-access.util';
import { useCompleteOnboarding } from '../../_expert/use-complete-onboarding.hook';
import { isValidOnboardingLink, toOnboardingLink } from './first-drafts.util';

export function useFirstDrafts(): FirstDraftsState {
  const { getToken } = useAuthIdentity();
  const { brandId, organizationId, isBrandScopeResolved } = useBrand();
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
  const [savingPostIds, setSavingPostIds] = useState<string[]>([]);
  const pendingFeedback = useRef(new Set<string>());
  const [error, setError] = useState<FirstDraftsError | null>(null);
  const [isContinuing, setIsContinuing] = useState(false);
  const [resolvedScope, setResolvedScope] = useState('');
  const [isRestoring, setIsRestoring] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [verdicts, setVerdicts] = useState<
    Readonly<Record<string, FirstDraftVerdict>>
  >({});
  const controllerRef = useRef<AbortController | null>(null);
  const tokenRef = useRef(getToken);
  tokenRef.current = getToken;
  const scopeKey = JSON.stringify([currentUser?.id, organizationId, brandId]);
  const liveScope = useRef(scopeKey);
  liveScope.current = scopeKey;
  const storageKey = `genfeed.onboarding.view.${scopeKey}`;
  const getService = useCallback(async () => {
    const token = await resolveAuthToken(tokenRef.current);
    if (!token) throw new Error('Not authenticated');
    return OnboardingService.getInstance(token);
  }, []);

  const acceptRun = useCallback((run: IOnboardingDraftRun, initial = false) => {
    setResult(run.result);
    setIsGenerating(run.status === 'running');
    if (initial) setVerdicts(run.verdicts);
    if (run.result) {
      setRound(1);
      setPhase((current) =>
        initial || current === 'working' ? 'review' : current,
      );
    } else setPhase(run.status === 'running' ? 'working' : 'url');
    if (run.status === 'interrupted') setError('recovery');
  }, []);

  // A finished user lands here to replay the flow. The replay reads the saved
  // run but never starts a generation: that is the free allowance, and the
  // trial credits are not a replay's to grant.
  const isReplay = currentUser?.isOnboardingCompleted === true;
  useEffect(() => {
    if (!brandId || !currentUser?.id || isLoading || !isBrandScopeResolved)
      return;
    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    const epoch = scopeKey;
    setIsRestoring(true);
    setResult(null);
    setVerdicts({});
    setSavingPostIds([]);
    pendingFeedback.current.clear();
    setScan(null);
    setRound(0);
    setError(null);
    setPhase('url');
    setIsGenerating(false);
    void (async () => {
      try {
        let requestedDomain = searchParams.get('brandDomain');
        try {
          requestedDomain ??= localStorage.getItem(
            ONBOARDING_STORAGE_KEYS.brandDomain,
          );
        } catch {}
        const resolved = resolveSignupBrandDomain({
          email: currentUser.email,
          requestedDomain,
        });
        let saved: string | null = null;
        try {
          saved = sessionStorage.getItem(storageKey);
        } catch {}
        let view: unknown = null;
        try {
          view = saved ? JSON.parse(saved) : null;
        } catch {}
        const storedUrl =
          typeof view === 'object' &&
          view !== null &&
          'url' in view &&
          typeof view.url === 'string'
            ? view.url
            : '';
        setUrl(storedUrl || resolved.websiteUrl || '');
        const run = await (await getService()).readDrafts(
          brandId,
          controller.signal,
        );
        if (controller.signal.aborted || liveScope.current !== epoch) return;
        if (run) {
          acceptRun(run, true);
          if (
            run.result &&
            (searchParams.get('step') === 'schedule' ||
              (typeof view === 'object' &&
                view !== null &&
                'phase' in view &&
                view.phase === 'schedule'))
          )
            setPhase('schedule');
        }
      } catch (caught) {
        if (controller.signal.aborted || liveScope.current !== epoch) return;
        logger.error('Failed to restore onboarding', caught);
        setError('recovery');
      } finally {
        if (!controller.signal.aborted && liveScope.current === epoch) {
          setResolvedScope(epoch);
          setIsRestoring(false);
        }
      }
    })();
    return () => controller.abort();
  }, [
    brandId,
    currentUser?.id,
    currentUser?.email,
    isLoading,
    isBrandScopeResolved,
    scopeKey,
    storageKey,
    searchParams,
    getService,
    acceptRun,
  ]);

  useEffect(() => {
    if (isRestoring || resolvedScope !== scopeKey) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({ url, phase }));
    } catch {}
  }, [isRestoring, resolvedScope, scopeKey, storageKey, url, phase]);

  useEffect(() => {
    if (!isGenerating || !brandId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const run = await (await getService()).readDrafts(
          brandId,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        if (run) acceptRun(run);
        if (run?.status === 'running') timer = setTimeout(poll, 2000);
      } catch (caught) {
        if (!controller.signal.aborted) {
          logger.error('Failed to reconcile onboarding', caught);
          timer = setTimeout(poll, 4000);
        }
      }
    };
    timer = setTimeout(poll, 2000);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [isGenerating, brandId, getService, acceptRun]);

  const startGeneration = useCallback(
    async (context?: IOnboardingDraftContext) => {
      if (!brandId || isRestoring || isGenerating) return;
      const epoch = scopeKey;
      const controller = new AbortController();
      controllerRef.current?.abort();
      controllerRef.current = controller;
      setError(null);
      setPhase('working');
      setWorkingStep('scanning');
      try {
        const service = await getService();
        const existing = await service.readDrafts(brandId, controller.signal);
        if (controller.signal.aborted || liveScope.current !== epoch) return;
        if (existing && !context) {
          acceptRun(existing, true);
          return;
        }
        if (isReplay) {
          setPhase('url');
          setError('replay');
          return;
        }
        if (!context) {
          const scanned = await service.scanBrand(
            brandId,
            toOnboardingLink(url),
            controller.signal,
          );
          if (controller.signal.aborted || liveScope.current !== epoch) return;
          setScan(scanned);
          if (scanned.status !== 'scanned') {
            setPhase('context');
            return;
          }
        }
        setWorkingStep('drafting');
        setIsGenerating(true);
        const next = await service.generateDrafts(
          brandId,
          {
            ...(context ? { context } : {}),
            ...(context && result?.requestKey
              ? { previousRequestKey: result.requestKey }
              : {}),
          },
          controller.signal,
        );
        if (controller.signal.aborted || liveScope.current !== epoch) return;
        setResult(next);
        setRound((current) => current + 1);
        setPhase('review');
        setIsGenerating(Boolean(next.videoIngredientId && !next.videoUrl));
      } catch (caught) {
        if (controller.signal.aborted || liveScope.current !== epoch) return;
        logger.error('Onboarding request needs reconciliation', caught);
        try {
          const run = await (await getService()).readDrafts(
            brandId,
            controller.signal,
          );
          if (controller.signal.aborted || liveScope.current !== epoch) return;
          if (run) {
            acceptRun(run, true);
            return;
          }
        } catch {}
        setIsGenerating(false);
        setError('recovery');
        setPhase('url');
      }
    },
    [
      acceptRun,
      brandId,
      getService,
      isGenerating,
      isReplay,
      isRestoring,
      result?.requestKey,
      scopeKey,
      url,
    ],
  );

  const onVerdict = useCallback(
    (item: IOnboardingFirstDraft, verdict: FirstDraftVerdict | null) => {
      if (!brandId || pendingFeedback.current.has(item.postId)) return;
      setError(null);
      pendingFeedback.current.add(item.postId);
      setSavingPostIds((current) => [...current, item.postId]);
      const epoch = scopeKey;
      const previous = verdicts[item.postId];
      setVerdicts((current) => {
        const { [item.postId]: _dropped, ...rest } = current;
        return verdict ? { ...rest, [item.postId]: verdict } : rest;
      });
      void (async () => {
        try {
          const token = await resolveAuthToken(tokenRef.current);
          if (!token) throw new Error('Not authenticated');
          const service = BrandedGenerationReceiptsService.getInstance(token);
          if (verdict)
            await service.rateFeedback(brandId, item.receiptId, {
              rating: verdict,
              reasons: [],
            });
          else await service.withdrawFeedback(brandId, item.receiptId);
        } catch (caught) {
          if (liveScope.current !== epoch) return;
          logger.error('Failed to save onboarding feedback', caught);
          setError('feedback');
          setVerdicts((current) => {
            const { [item.postId]: _dropped, ...rest } = current;
            return previous ? { ...rest, [item.postId]: previous } : rest;
          });
        } finally {
          if (liveScope.current === epoch) {
            pendingFeedback.current.delete(item.postId);
            setSavingPostIds((current) =>
              current.filter((id) => id !== item.postId),
            );
          }
        }
      })();
    },
    [brandId, scopeKey, verdicts],
  );

  const likedDrafts = (result?.drafts ?? []).filter(
    (item) => verdicts[item.postId] === 'up',
  );
  const onContinue = useCallback(() => {
    if (isContinuing) return;
    setIsContinuing(true);
    setError(null);

    const finish =
      steps.length > 1 ? handleStepComplete('brand') : completeOnboarding();
    void finish.catch((caught: unknown) => {
      logger.error('Failed to finish onboarding', caught);
      setError('continue');
      setIsContinuing(false);
    });
  }, [completeOnboarding, handleStepComplete, isContinuing, steps.length]);

  return {
    canRetry: round < ONBOARDING_MAX_DRAFT_ROUNDS,
    isReady:
      isBrandScopeResolved && Boolean(brandId) && resolvedScope === scopeKey,
    isRestoring,
    isGenerating,
    savingPostIds,
    error,
    isContinuing,
    isScanFailed: scan?.status === 'failed',
    likedDrafts,
    onContinue,
    onNotRight: () => setPhase('context'),
    onNavigate: (step) => {
      if (isRestoring || isContinuing || resolvedScope !== scopeKey) return;
      const next =
        step === 0
          ? 'url'
          : step === 1 && isGenerating && !result
            ? 'working'
            : step === 2 && result
              ? 'review'
              : step === 3 && result
                ? 'schedule'
                : null;
      if (!next) return;
      if (next !== 'schedule' && searchParams.get('step') === 'schedule')
        replace(APP_ROUTES.ONBOARDING.BRAND);
      setPhase(next);
    },
    onBack: () => {
      if (phase === 'schedule' && searchParams.get('step') === 'schedule')
        replace(APP_ROUTES.ONBOARDING.BRAND);
      setPhase((current) => (current === 'schedule' ? 'review' : 'url'));
    },
    onSchedule: () => {
      if (!brandId || !result) return;
      setPhase('schedule');
    },
    onVerdict,
    onSkipLink: () => setPhase('context'),
    onStart: () => {
      if (result) setPhase('review');
      else if (isGenerating) setPhase('working');
      else if (!isValidOnboardingLink(url)) setError('invalidUrl');
      else void startGeneration();
    },
    onSubmitContext: (context) => {
      void startGeneration(context);
    },
    onUrlChange: (value: string) => {
      setUrl(value);
      setError((current) => (current === 'invalidUrl' ? null : current));
    },
    phase,
    result,
    round,
    scan,
    url,
    verdicts,
    workingStep,
  };
}
