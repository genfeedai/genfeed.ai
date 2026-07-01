'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  AgentApiService,
  useAgentChatStore,
  useAgentChatStream,
} from '@genfeedai/agent';
import { APP_ROUTES } from '@genfeedai/constants';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import {
  getPlaywrightAuthState,
  resolveAuthToken,
} from '@helpers/auth/auth.helper';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { logger } from '@services/core/logger.service';
import { ServicesService } from '@services/external/services.service';
import { OnboardingFunnelService } from '@services/onboarding/onboarding-funnel.service';
import {
  useParams,
  usePathname,
  useRouter,
  useSearchParams,
} from 'next/navigation';
import {
  type PropsWithChildren,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { normalizeProtectedPathname } from '@/lib/navigation/operator-shell';
import { AgentWorkspaceContext } from './agent-workspace-context';

const UNSET_THREAD_BASELINE = Symbol('agent-new-route-baseline');

function AgentWorkspaceLayoutClientContent({ children }: PropsWithChildren) {
  const rawPathname = usePathname();
  const pathname = useMemo(
    () => normalizeProtectedPathname(rawPathname),
    [rawPathname],
  );
  const params = useParams<{ id?: string; threadId?: string }>();
  const { replace } = useRouter();
  const { orgHref } = useOrgUrl();
  const searchParams = useSearchParams();
  const { getToken, isLoaded } = useAuthIdentity();
  const playwrightAuth = getPlaywrightAuthState();
  const { selectedBrand } = useBrand();
  const activeThreadId = useAgentChatStore((s) => s.activeThreadId);
  const completedRef = useRef(false);
  const lastBootstrapKeyRef = useRef<string | null>(null);
  const newRouteBaselineThreadRef = useRef<
    string | null | typeof UNSET_THREAD_BASELINE
  >(UNSET_THREAD_BASELINE);
  const pendingNavigationThreadRef = useRef<string | null>(null);
  const isJourneyRoute = pathname.startsWith(APP_ROUTES.AGENT.JOURNEY);
  const isOnboarding = pathname.startsWith(APP_ROUTES.AGENT.ONBOARDING);
  const isOnboardingEntryRoute = pathname === APP_ROUTES.AGENT.ONBOARDING;
  const isStandardNewRoute =
    pathname === APP_ROUTES.AGENT.ROOT || pathname === APP_ROUTES.AGENT.NEW;
  const isUnthreadedRoute = isOnboardingEntryRoute || isStandardNewRoute;
  const prefillPrompt = searchParams.get('prompt')?.trim() || '';
  const effectiveIsLoaded = isLoaded || playwrightAuth?.isLoaded === true;
  const threadId =
    typeof params.threadId === 'string' && params.threadId.length > 0
      ? params.threadId
      : typeof params.id === 'string' && params.id.length > 0
        ? params.id
        : undefined;

  const agentApiService = useMemo(
    () =>
      new AgentApiService({
        baseUrl: process.env.NEXT_PUBLIC_API_ENDPOINT ?? '',
        getToken: async () => resolveAuthToken(getToken),
      }),
    [getToken],
  );

  const completeOnboardingFlow = useCallback(async () => {
    if (completedRef.current) {
      return;
    }

    completedRef.current = true;

    const effectiveToken = await resolveAuthToken(getToken);
    if (effectiveToken) {
      const funnelService = OnboardingFunnelService.getInstance(effectiveToken);
      await funnelService.completeFunnel();
    }
    await getToken({ forceRefresh: true }).catch(() => null);
  }, [getToken]);

  const { sendMessage } = useAgentChatStream({
    apiService: agentApiService,
    onOnboardingCompleted: completeOnboardingFlow,
  });

  const handleOAuthConnect = useCallback(
    async (platform: string) => {
      try {
        const token = await resolveAuthToken(getToken);
        if (!token) {
          return;
        }

        // Brand is optional for agent OAuth; uses active brand if available.
        const service = new ServicesService(platform, token);
        const credential = await service.postConnect({
          ...(selectedBrand ? { brand: selectedBrand.id } : {}),
        });
        const returnTo = isOnboarding
          ? threadId
            ? orgHref(`${APP_ROUTES.AGENT.ONBOARDING}/${threadId}`)
            : orgHref(APP_ROUTES.AGENT.ONBOARDING)
          : threadId
            ? orgHref(`${APP_ROUTES.AGENT.ROOT}/${threadId}`)
            : orgHref(APP_ROUTES.AGENT.NEW);
        const separator = credential.url.includes('?') ? '&' : '?';
        window.open(
          `${credential.url}${separator}return_to=${encodeURIComponent(returnTo)}`,
          '_self',
        );
      } catch (error) {
        logger.error('OAuth connect failed', error);
      }
    },
    [getToken, isOnboarding, orgHref, selectedBrand, threadId],
  );

  // Bootstrap the prefilled prompt only on unthreaded entry routes.
  useEffect(() => {
    const controller = new AbortController();
    const bootstrapKey =
      isUnthreadedRoute && !isJourneyRoute && prefillPrompt
        ? `${isOnboarding ? 'onboarding' : 'agent'}:${prefillPrompt}`
        : null;

    if (
      !effectiveIsLoaded ||
      isJourneyRoute ||
      !isUnthreadedRoute ||
      !bootstrapKey ||
      lastBootstrapKeyRef.current === bootstrapKey
    ) {
      return () => controller.abort();
    }

    lastBootstrapKeyRef.current = bootstrapKey;

    void sendMessage(prefillPrompt, {
      forceNewThread: true,
      signal: controller.signal,
      source: isOnboarding ? 'onboarding' : 'agent',
    }).catch(() => undefined);

    return () => controller.abort();
  }, [
    isJourneyRoute,
    effectiveIsLoaded,
    isOnboarding,
    isUnthreadedRoute,
    prefillPrompt,
    sendMessage,
  ]);

  // Reset bootstrap key when leaving the unthreaded route or clearing the prefill prompt.
  useEffect(() => {
    if (!isUnthreadedRoute || isJourneyRoute || !prefillPrompt) {
      lastBootstrapKeyRef.current = null;
    }
  }, [isJourneyRoute, isUnthreadedRoute, prefillPrompt]);

  // Auto-navigate from an unthreaded route to the created thread route.
  useEffect(() => {
    if (!isUnthreadedRoute || isJourneyRoute) {
      newRouteBaselineThreadRef.current = UNSET_THREAD_BASELINE;
      pendingNavigationThreadRef.current = null;
      return;
    }

    if (newRouteBaselineThreadRef.current === UNSET_THREAD_BASELINE) {
      newRouteBaselineThreadRef.current = activeThreadId;
      return;
    }

    if (
      activeThreadId &&
      activeThreadId !== newRouteBaselineThreadRef.current &&
      pendingNavigationThreadRef.current !== activeThreadId
    ) {
      const nextRoute = isOnboarding
        ? orgHref(`${APP_ROUTES.AGENT.ONBOARDING}/${activeThreadId}`)
        : orgHref(`${APP_ROUTES.AGENT.ROOT}/${activeThreadId}`);
      newRouteBaselineThreadRef.current = activeThreadId;
      pendingNavigationThreadRef.current = activeThreadId;
      replace(nextRoute);
    }
  }, [
    activeThreadId,
    isJourneyRoute,
    isOnboarding,
    isUnthreadedRoute,
    orgHref,
    replace,
  ]);

  const contextValue = useMemo(
    () => ({
      agentApiService,
      completeOnboardingFlow,
      handleOAuthConnect,
      isLoaded: effectiveIsLoaded,
      isOnboarding,
    }),
    [
      agentApiService,
      effectiveIsLoaded,
      isOnboarding,
      handleOAuthConnect,
      completeOnboardingFlow,
    ],
  );

  return (
    <AgentWorkspaceContext.Provider value={contextValue}>
      {children}
    </AgentWorkspaceContext.Provider>
  );
}

export function AgentWorkspaceLayoutClient({ children }: PropsWithChildren) {
  return (
    <Suspense fallback={null}>
      <AgentWorkspaceLayoutClientContent>
        {children}
      </AgentWorkspaceLayoutClientContent>
    </Suspense>
  );
}
