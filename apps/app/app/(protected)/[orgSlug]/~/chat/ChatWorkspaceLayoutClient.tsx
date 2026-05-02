'use client';

import { useAuth, useSession } from '@clerk/nextjs';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  AgentApiService,
  useAgentChatStore,
  useAgentChatStream,
} from '@genfeedai/agent';
import {
  getPlaywrightAuthState,
  resolveClerkToken,
} from '@helpers/auth/clerk.helper';
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
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { normalizeProtectedPathname } from '@/lib/navigation/operator-shell';
import { ChatWorkspaceContext } from './chat-workspace-context';

const UNSET_THREAD_BASELINE = Symbol('chat-new-route-baseline');

export function ChatWorkspaceLayoutClient({
  children,
}: PropsWithChildren): JSX.Element {
  const rawPathname = usePathname();
  const pathname = useMemo(
    () => normalizeProtectedPathname(rawPathname),
    [rawPathname],
  );
  const params = useParams<{ id?: string; threadId?: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { getToken, isLoaded } = useAuth();
  const { session } = useSession();
  const playwrightAuth = getPlaywrightAuthState();
  const { selectedBrand } = useBrand();
  const activeThreadId = useAgentChatStore((s) => s.activeThreadId);
  const completedRef = useRef(false);
  const lastBootstrapKeyRef = useRef<string | null>(null);
  const newRouteBaselineThreadRef = useRef<
    string | null | typeof UNSET_THREAD_BASELINE
  >(UNSET_THREAD_BASELINE);
  const pendingNavigationThreadRef = useRef<string | null>(null);
  const isJourneyRoute = pathname.startsWith('/chat/journey');
  const isOnboarding = pathname.startsWith('/chat/onboarding');
  const isOnboardingEntryRoute = pathname === '/chat/onboarding';
  const isAgentRoute = pathname.startsWith('/agent');
  const conversationBasePath = isAgentRoute ? '/agent' : '/chat';
  const isStandardNewRoute =
    pathname === '/chat/new' ||
    pathname === '/agent' ||
    pathname === '/agent/new';
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
        getToken: async () => resolveClerkToken(getToken),
      }),
    [getToken],
  );

  const completeOnboardingFlow = useCallback(async () => {
    if (completedRef.current) {
      return;
    }

    completedRef.current = true;

    const effectiveToken = await resolveClerkToken(getToken);
    if (effectiveToken) {
      const funnelService = OnboardingFunnelService.getInstance(effectiveToken);
      await funnelService.completeFunnel();
    }
    await session?.touch().catch(() => undefined);
  }, [getToken, session]);

  const { sendMessage } = useAgentChatStream({
    apiService: agentApiService,
    onOnboardingCompleted: completeOnboardingFlow,
  });

  const handleOAuthConnect = useCallback(
    async (platform: string) => {
      try {
        const token = await resolveClerkToken(getToken);
        if (!token) {
          return;
        }

        // Brand is optional for chat OAuth — uses active brand if available
        const service = new ServicesService(platform, token);
        const credential = await service.postConnect({
          ...(selectedBrand ? { brand: selectedBrand.id } : {}),
        });
        const returnTo = isOnboarding
          ? threadId
            ? `/chat/onboarding/${threadId}`
            : '/chat/onboarding'
          : threadId
            ? `${conversationBasePath}/${threadId}`
            : `${conversationBasePath}/new`;
        const separator = credential.url.includes('?') ? '&' : '?';
        window.open(
          `${credential.url}${separator}return_to=${encodeURIComponent(returnTo)}`,
          '_self',
        );
      } catch (error) {
        logger.error('OAuth connect failed', error);
      }
    },
    [conversationBasePath, getToken, isOnboarding, selectedBrand, threadId],
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
        ? `/chat/onboarding/${activeThreadId}`
        : `${conversationBasePath}/${activeThreadId}`;
      newRouteBaselineThreadRef.current = activeThreadId;
      pendingNavigationThreadRef.current = activeThreadId;
      router.replace(nextRoute);
    }
  }, [
    activeThreadId,
    conversationBasePath,
    isJourneyRoute,
    isOnboarding,
    isUnthreadedRoute,
    router,
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
    <ChatWorkspaceContext.Provider value={contextValue}>
      {children}
    </ChatWorkspaceContext.Provider>
  );
}
