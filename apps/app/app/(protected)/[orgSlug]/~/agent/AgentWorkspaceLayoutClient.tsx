import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  getBrandEntityId,
  getBrandOrganizationId,
} from '@contexts/user/brand-context/brand-context.helpers';
import {
  AgentApiService,
  AgentApiServiceProvider,
  isRenderableThreadId,
  useAgentChatStore,
  useAgentChatStream,
} from '@genfeedai/agent';
import { AgentThreadMode } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useAgentOAuthConnect } from '@genfeedai/hooks/agent/use-agent-oauth-connect';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import {
  getPlaywrightAuthState,
  resolveAuthToken,
} from '@helpers/auth/auth.helper';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import type { AgentWorkspaceLayoutClientProps } from '@/features/agents/props/agent-workspace-layout-client.props';
import { ANALYTICS_EVENTS, captureAnalyticsEvent } from '@/lib/analytics';
import { normalizeProtectedPathname } from '@/lib/navigation/operator-shell';
import {
  buildScopedThreadHref,
  extractAgentThreadIdFromPathname,
} from '@/lib/workspace-shell/conversation-scope-location';
import { AgentWorkspaceContext } from './agent-workspace-context';

const UNSET_THREAD_BASELINE = Symbol('agent-new-route-baseline');

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
  const lastBootstrapKeyRef = useRef<string | null>(null);
  const newRouteBaselineThreadRef = useRef<
    string | null | typeof UNSET_THREAD_BASELINE
  >(UNSET_THREAD_BASELINE);
  const pendingNavigationThreadRef = useRef<string | null>(null);
  const isJourneyRoute = pathname.startsWith(APP_ROUTES.AGENT.JOURNEY);
  const isStandardNewRoute =
    pathname === APP_ROUTES.AGENT.ROOT || pathname === APP_ROUTES.AGENT.NEW;
  const isUnthreadedRoute = isStandardNewRoute;
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
  const useManualBootstrap =
    searchParams.get('agentMode') === AgentThreadMode.MANUAL;
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

  const { sendMessage } = useAgentChatStream({
    apiService: agentApiService,
  });

  const handleOAuthConnect = useAgentOAuthConnect();

  // Bootstrap the prefilled prompt only on unthreaded entry routes.
  useEffect(() => {
    const controller = new AbortController();
    const bootstrapKey =
      isUnthreadedRoute && !isJourneyRoute && prefillPrompt
        ? `agent:${prefillPrompt}`
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
      ...(useManualBootstrap ? { agentMode: AgentThreadMode.MANUAL } : {}),
      signal: controller.signal,
      source: 'agent',
    }).catch(() => undefined);

    return () => controller.abort();
  }, [
    isJourneyRoute,
    brandId,
    effectiveIsLoaded,
    isUnthreadedRoute,
    prefillPrompt,
    useManualBootstrap,
    sendMessage,
  ]);

  // Reset bootstrap key when leaving the unthreaded route or clearing the prefill prompt.
  useEffect(() => {
    if (!isUnthreadedRoute || isJourneyRoute || !prefillPrompt) {
      lastBootstrapKeyRef.current = null;
    }
  }, [isJourneyRoute, isUnthreadedRoute, prefillPrompt]);

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

  // Auto-navigate from an unthreaded route to the created thread route. Bare
  // /agent is the master conversation: it stays put, apart from a prefilled
  // prompt, which starts a thread of its own.
  useEffect(() => {
    if (
      !isUnthreadedRoute ||
      isJourneyRoute ||
      (pathname === APP_ROUTES.AGENT.ROOT && !prefillPrompt)
    ) {
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
      const nextRoute = activeHref(
        `${APP_ROUTES.AGENT.ROOT}/${activeThreadId}`,
      );
      newRouteBaselineThreadRef.current = activeThreadId;
      pendingNavigationThreadRef.current = activeThreadId;
      captureAnalyticsEvent(ANALYTICS_EVENTS.AGENT_THREAD_CREATED, {
        agentType: 'standard',
      });
      replace(nextRoute);
    }
  }, [
    activeThreadId,
    isJourneyRoute,
    isUnthreadedRoute,
    activeHref,
    pathname,
    prefillPrompt,
    replace,
  ]);

  const contextValue = useMemo(
    () => ({
      agentApiService,
      handleOAuthConnect,
      isLoaded: effectiveIsLoaded,
    }),
    [agentApiService, effectiveIsLoaded, handleOAuthConnect],
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
