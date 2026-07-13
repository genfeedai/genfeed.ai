'use client';

import {
  AgentApiService,
  useAgentChatStore,
  useAgentChatStream,
} from '@genfeedai/agent';
import { APP_ROUTES } from '@genfeedai/constants';
import { useAgentOAuthConnect } from '@genfeedai/hooks/agent/use-agent-oauth-connect';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import {
  getPlaywrightAuthState,
  resolveAuthToken,
} from '@helpers/auth/auth.helper';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { UsersService } from '@services/organization/users.service';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  type PropsWithChildren,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { ANALYTICS_EVENTS, captureAnalyticsEvent } from '@/lib/analytics';
import { normalizeProtectedPathname } from '@/lib/navigation/operator-shell';
import { AgentWorkspaceContext } from './agent-workspace-context';

const UNSET_THREAD_BASELINE = Symbol('agent-new-route-baseline');

type AgentWorkspaceLayoutClientProps = PropsWithChildren<{
  readonly agentApiService?: AgentApiService;
}>;

function AgentWorkspaceLayoutClientContent({
  agentApiService: providedAgentApiService,
  children,
}: AgentWorkspaceLayoutClientProps) {
  const rawPathname = usePathname();
  const pathname = useMemo(
    () => normalizeProtectedPathname(rawPathname),
    [rawPathname],
  );
  const { replace } = useRouter();
  const { orgHref } = useOrgUrl();
  const searchParams = useSearchParams();
  const { getToken, isLoaded } = useAuthIdentity();
  const playwrightAuth = getPlaywrightAuthState();
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

  const agentApiService = useMemo(
    () =>
      providedAgentApiService ??
      new AgentApiService({
        baseUrl: process.env.NEXT_PUBLIC_API_ENDPOINT ?? '',
        getToken: async (options) => resolveAuthToken(getToken, options),
      }),
    [getToken, providedAgentApiService],
  );

  const completeOnboardingFlow = useCallback(async () => {
    if (completedRef.current) {
      return;
    }

    completedRef.current = true;

    const effectiveToken = await resolveAuthToken(getToken);
    if (effectiveToken) {
      // Onboarding completion cascade lives behind PATCH /users/me (REST audit #1354).
      await UsersService.getInstance(effectiveToken).patchMe({
        isOnboardingCompleted: true,
      });
    }
    await getToken({ forceRefresh: true }).catch(() => null);
  }, [getToken]);

  const { sendMessage } = useAgentChatStream({
    apiService: agentApiService,
    onOnboardingCompleted: completeOnboardingFlow,
  });

  const handleOAuthConnect = useAgentOAuthConnect({ isOnboarding });

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
      captureAnalyticsEvent(ANALYTICS_EVENTS.AGENT_THREAD_CREATED, {
        agentType: isOnboarding ? 'onboarding' : 'standard',
      });
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

export function AgentWorkspaceLayoutClient({
  agentApiService,
  children,
}: AgentWorkspaceLayoutClientProps) {
  return (
    <Suspense fallback={null}>
      <AgentWorkspaceLayoutClientContent agentApiService={agentApiService}>
        {children}
      </AgentWorkspaceLayoutClientContent>
    </Suspense>
  );
}
