'use client';

import {
  type BrandContextType,
  useBrand,
} from '@contexts/user/brand-context/brand-context';
import {
  getBrandEntityId,
  getBrandOrganizationId,
} from '@contexts/user/brand-context/brand-context.helpers';
import {
  AgentApiService,
  AgentApiServiceProvider,
  type AgentThread,
  isRenderableThreadId,
  runAgentApiEffect,
  useAgentChatStore,
  useAgentChatStream,
} from '@genfeedai/agent';
import { AgentThreadStatus } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
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
import {
  buildOrganizationNewThreadHref,
  buildScopedThreadHref,
  extractAgentThreadIdFromPathname,
} from '@/lib/workspace-shell/conversation-scope-location';
import { AgentWorkspaceContext } from './agent-workspace-context';

const UNSET_THREAD_BASELINE = Symbol('agent-new-route-baseline');

/**
 * Threads opened from the onboarding entry route carry this source. The resume
 * lookup filters on it server-side so the newest onboarding thread is found no
 * matter how many newer standard threads the operator has.
 */
const ONBOARDING_THREAD_SOURCE = 'onboarding';

function mostRecentAuthorizedThread(
  threads: AgentThread[],
  organizationId: string,
  brands: BrandContextType['brands'],
): AgentThread | null {
  return (
    threads
      .filter((thread) => {
        if (
          thread.organizationId !== organizationId ||
          thread.status !== AgentThreadStatus.ACTIVE ||
          !isRenderableThreadId(thread.id)
        ) {
          return false;
        }

        if (!thread.brandId) {
          return true;
        }

        return brands.some(
          (brand) =>
            getBrandEntityId(brand) === thread.brandId &&
            getBrandOrganizationId(brand) === organizationId,
        );
      })
      .sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt),
      )[0] ?? null
  );
}

type AgentWorkspaceLayoutClientProps = PropsWithChildren<{
  readonly agentApiService?: AgentApiService;
}>;

function AgentWorkspaceLayoutClientContent({
  agentApiService: providedAgentApiService,
  children,
}: AgentWorkspaceLayoutClientProps) {
  const rawPathname = usePathname();
  const pathname = useMemo(
    () => normalizeProtectedPathname(rawPathname ?? ''),
    [rawPathname],
  );
  const { replace } = useRouter();
  const { brandId, brands, isBrandScopeResolved, organizationId } = useBrand();
  const { activeHref, orgSlug } = useOrgUrl();
  const searchParams = useSearchParams();
  const { getToken, isLoaded } = useAuthIdentity();
  const playwrightAuth = getPlaywrightAuthState();
  const activeThreadId = useAgentChatStore((s) => s.activeThreadId);
  const threads = useAgentChatStore((s) => s.threads);
  const completedRef = useRef(false);
  const lastBootstrapKeyRef = useRef<string | null>(null);
  const newRouteBaselineThreadRef = useRef<
    string | null | typeof UNSET_THREAD_BASELINE
  >(UNSET_THREAD_BASELINE);
  const pendingNavigationThreadRef = useRef<string | null>(null);
  const hasAttemptedResumeRef = useRef(false);
  const hasAttemptedReturningBootstrapRef = useRef(false);
  const isJourneyRoute = pathname.startsWith(APP_ROUTES.AGENT.JOURNEY);
  const isOnboarding = pathname.startsWith(APP_ROUTES.AGENT.ONBOARDING);
  const isOnboardingEntryRoute = pathname === APP_ROUTES.AGENT.ONBOARDING;
  const isStandardNewRoute =
    pathname === APP_ROUTES.AGENT.ROOT || pathname === APP_ROUTES.AGENT.NEW;
  const isReturningBootstrapRoute = pathname === APP_ROUTES.AGENT.ROOT;
  const isUnthreadedRoute = isOnboardingEntryRoute || isStandardNewRoute;
  const explicitPrefillPrompt = searchParams.get('prompt')?.trim() || '';
  const taskPrefillPrompt = useMemo(() => {
    if (searchParams.get('taskSource') !== 'workspace') {
      return '';
    }

    const taskId = searchParams.get('taskId')?.trim() || '';
    const taskTitle = searchParams.get('taskTitle')?.trim() || '';
    const outputType = searchParams.get('taskOutputType')?.trim() || '';
    const executionPath = searchParams.get('taskExecutionPath')?.trim() || '';

    if (!taskId && !taskTitle) {
      return '';
    }

    return [
      `Continue the workspace task "${taskTitle || taskId}".`,
      taskId ? `Task id: ${taskId}.` : '',
      outputType ? `Requested output: ${outputType}.` : '',
      executionPath ? `Execution path: ${executionPath}.` : '',
    ]
      .filter(Boolean)
      .join(' ');
  }, [searchParams]);
  const prefillPrompt = explicitPrefillPrompt || taskPrefillPrompt;
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
      ...(brandId ? { brandId } : {}),
      forceNewThread: true,
      signal: controller.signal,
      source: isOnboarding ? 'onboarding' : 'agent',
    }).catch(() => undefined);

    return () => controller.abort();
  }, [
    isJourneyRoute,
    brandId,
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

  // Resume onboarding after a reload or restart: a bare visit to the entry
  // route carries no prefill prompt, so nothing would bootstrap a thread and
  // the operator would silently start over. Reopen the newest onboarding
  // thread instead; a first-time operator has none and falls through to the
  // empty composer.
  useEffect(() => {
    if (
      !effectiveIsLoaded ||
      !isOnboardingEntryRoute ||
      prefillPrompt ||
      activeThreadId ||
      hasAttemptedResumeRef.current
    ) {
      return;
    }

    hasAttemptedResumeRef.current = true;
    const controller = new AbortController();

    void runAgentApiEffect(
      agentApiService.getThreadsEffect(
        {
          source: ONBOARDING_THREAD_SOURCE,
          status: AgentThreadStatus.ACTIVE,
        },
        controller.signal,
      ),
    )
      .then((threads) => {
        if (controller.signal.aborted) {
          return;
        }

        // The source filter is applied server-side, but the client repeats it
        // so an instance that predates the query parameter still resumes the
        // right thread instead of the newest standard one.
        const resumable = threads
          .filter((thread) => thread.source === ONBOARDING_THREAD_SOURCE)
          .sort((left, right) =>
            right.updatedAt.localeCompare(left.updatedAt),
          )[0];

        if (!resumable || pendingNavigationThreadRef.current === resumable.id) {
          return;
        }

        pendingNavigationThreadRef.current = resumable.id;
        newRouteBaselineThreadRef.current = resumable.id;
        replace(activeHref(`${APP_ROUTES.AGENT.ONBOARDING}/${resumable.id}`));
      })
      .catch(() => undefined);

    return () => controller.abort();
  }, [
    activeHref,
    activeThreadId,
    agentApiService,
    effectiveIsLoaded,
    isOnboardingEntryRoute,
    prefillPrompt,
    replace,
  ]);

  // Allow another resume attempt once the operator leaves the entry route.
  useEffect(() => {
    if (!isOnboardingEntryRoute) {
      hasAttemptedResumeRef.current = false;
    }
  }, [isOnboardingEntryRoute]);

  // Bare /agent is the root/login bootstrap sentinel. Restore only a thread
  // returned for the active organization and independently re-check its org,
  // status, id, and brand before placing it in the URL. /agent/new and explicit
  // /agent/:id deep links never enter this lookup.
  //
  // The brand check authorizes against `brands`, so the one-shot guard stays
  // unconsumed until brand scope resolves (#2702). Deciding early would read a
  // still-loading empty list, treat an authorized branded thread as
  // unavailable, redirect to /agent/new, and never retry once brands arrive.
  useEffect(() => {
    if (
      !effectiveIsLoaded ||
      !isBrandScopeResolved ||
      !isReturningBootstrapRoute ||
      prefillPrompt ||
      activeThreadId ||
      !organizationId ||
      !orgSlug ||
      hasAttemptedReturningBootstrapRef.current
    ) {
      return;
    }

    hasAttemptedReturningBootstrapRef.current = true;
    const controller = new AbortController();
    const fallbackHref = buildOrganizationNewThreadHref(orgSlug);

    void runAgentApiEffect(
      agentApiService.getThreadsEffect(
        { status: AgentThreadStatus.ACTIVE },
        controller.signal,
      ),
    )
      .then((threads) => {
        if (controller.signal.aborted) {
          return;
        }

        const recentThread = mostRecentAuthorizedThread(
          threads,
          organizationId,
          brands,
        );
        if (!recentThread) {
          replace(fallbackHref);
          return;
        }

        const threadBrand = recentThread.brandId
          ? brands.find(
              (brand) =>
                getBrandEntityId(brand) === recentThread.brandId &&
                getBrandOrganizationId(brand) === organizationId,
            )
          : null;
        replace(
          buildScopedThreadHref(
            orgSlug,
            threadBrand?.slug ?? null,
            recentThread.id,
          ),
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          replace(fallbackHref);
        }
      });

    return () => controller.abort();
  }, [
    activeThreadId,
    agentApiService,
    brands,
    effectiveIsLoaded,
    isBrandScopeResolved,
    isReturningBootstrapRoute,
    organizationId,
    orgSlug,
    prefillPrompt,
    replace,
  ]);

  // Release the one-shot guard when the route stops qualifying, and whenever
  // brand scope drops back to unresolved (org switch, session change) so a
  // decision taken against a superseded authorization set can be retried.
  useEffect(() => {
    if (!isReturningBootstrapRoute || !isBrandScopeResolved) {
      hasAttemptedReturningBootstrapRef.current = false;
    }
  }, [isBrandScopeResolved, isReturningBootstrapRoute]);

  // Deep-linked /agent/:id under the wrong brand slug: once the thread is in
  // the store, replace to the brand that owns it so chrome + list match data.
  useEffect(() => {
    if (!orgSlug || !organizationId) {
      return;
    }

    const routeThreadId = extractAgentThreadIdFromPathname(pathname);
    if (!routeThreadId || !isRenderableThreadId(routeThreadId)) {
      return;
    }

    const thread =
      threads.find((item) => item.id === routeThreadId) ??
      (activeThreadId === routeThreadId
        ? threads.find((item) => item.id === activeThreadId)
        : undefined);

    if (!thread?.brandId) {
      return;
    }

    // Still loading / wrong org — never bounce into another tenant.
    if (thread.organizationId && thread.organizationId !== organizationId) {
      return;
    }

    if (thread.brandId === brandId) {
      return;
    }

    const ownerBrand = brands.find(
      (brand) =>
        getBrandEntityId(brand) === thread.brandId &&
        getBrandOrganizationId(brand) === organizationId,
    );

    if (!ownerBrand?.slug) {
      return;
    }

    replace(buildScopedThreadHref(orgSlug, ownerBrand.slug, routeThreadId));
  }, [
    activeThreadId,
    brandId,
    brands,
    orgSlug,
    organizationId,
    pathname,
    replace,
    threads,
  ]);

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
        ? activeHref(`${APP_ROUTES.AGENT.ONBOARDING}/${activeThreadId}`)
        : activeHref(`${APP_ROUTES.AGENT.ROOT}/${activeThreadId}`);
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
    activeHref,
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
    <AgentApiServiceProvider service={agentApiService}>
      <AgentWorkspaceContext.Provider value={contextValue}>
        {children}
      </AgentWorkspaceContext.Provider>
    </AgentApiServiceProvider>
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
