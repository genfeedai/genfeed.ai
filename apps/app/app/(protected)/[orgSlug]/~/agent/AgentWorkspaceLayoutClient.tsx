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
  useAgentChatStore,
  useAgentChatStream,
} from '@genfeedai/agent';
import { AgentThreadMode, AgentThreadStatus } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createBrandAppRoute,
} from '@genfeedai/contracts/constants';
import { useAgentOAuthConnect } from '@genfeedai/hooks/agent/use-agent-oauth-connect';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import type { AgentWorkspaceLayoutClientProps } from '@genfeedai/props/agent/agent-workspace-layout-client.props';
import {
  getPlaywrightAuthState,
  resolveAuthToken,
} from '@helpers/auth/auth.helper';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import { ANALYTICS_EVENTS, captureAnalyticsEvent } from '@/lib/analytics';
import { normalizeProtectedPathname } from '@/lib/navigation/operator-shell';
import {
  buildOrganizationNewThreadHref,
  buildScopedThreadHref,
  extractAgentThreadIdFromPathname,
} from '@/lib/workspace-shell/conversation-scope-location';
import { AgentWorkspaceContext } from './agent-workspace-context';

const UNSET_THREAD_BASELINE = Symbol('agent-new-route-baseline');

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

// Brand-scoped `/:org/:brand/agent` resume: narrow to threads owned by that
// brand only, independent of what else the operator has open org-wide (#4674).
function mostRecentBrandThread(
  threads: AgentThread[],
  organizationId: string,
  brandId: string,
): AgentThread | null {
  return (
    threads
      .filter(
        (thread) =>
          thread.organizationId === organizationId &&
          thread.status === AgentThreadStatus.ACTIVE &&
          thread.brandId === brandId &&
          isRenderableThreadId(thread.id),
      )
      .sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt),
      )[0] ?? null
  );
}

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
  const { activeHref, brandSlug: routeBrandSlug, orgSlug } = useOrgUrl();
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
  const hasAttemptedReturningBootstrapRef = useRef(false);
  const isJourneyRoute = pathname.startsWith(APP_ROUTES.AGENT.JOURNEY);
  const isStandardNewRoute =
    pathname === APP_ROUTES.AGENT.ROOT || pathname === APP_ROUTES.AGENT.NEW;
  const isReturningBootstrapRoute = pathname === APP_ROUTES.AGENT.ROOT;
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

  // Bare /agent is the root/login bootstrap sentinel, reached either org-scoped
  // (/:org/~/agent) or brand-scoped (/:org/:brand/agent). Restore only a
  // thread returned for the active organization and independently re-check
  // its org, status, id, and brand before placing it in the URL. /agent/new
  // and explicit /agent/:id deep links never enter this lookup.
  //
  // A brand-scoped URL narrows the lookup to that brand only — pass brandId
  // into getThreads and re-check it client-side — and falls back to that
  // brand's own /agent/new, never the organization-wide newest thread (#4674).
  // The org-scoped route keeps resuming the organization's overall newest
  // authorized thread.
  //
  // The brand check authorizes against `brands`, so the one-shot guard stays
  // unconsumed until brand scope resolves (#2702). Deciding early would read a
  // still-loading empty list, treat an authorized branded thread as
  // unavailable, redirect to /agent/new, and never retry once brands arrive.
  // For a brand-scoped URL, also wait for `brandId` to resolve to the route's
  // brand before running so the lookup never fires against a stale brand.
  //
  // FR7: a brand-scoped entry must never resume a conversation belonging to a
  // brand other than the one in the URL. `brandId` from context can briefly
  // (or, for an unknown/mistyped brand slug, permanently) reflect a
  // *different* brand than the route names — it falls back to the operator's
  // last-selected brand when the URL slug doesn't match any authorized brand.
  // Require an authorized brand whose slug AND id both match before treating
  // `brandId` as authoritative for this route; otherwise go straight to that
  // brand slug's own new conversation rather than trust a mismatched id.
  useEffect(() => {
    const isBrandScopedRoute = Boolean(routeBrandSlug);
    const routeBrand = isBrandScopedRoute
      ? brands.find(
          (brand) =>
            brand.slug === routeBrandSlug &&
            getBrandEntityId(brand) === brandId &&
            getBrandOrganizationId(brand) === organizationId,
        )
      : undefined;

    if (
      !effectiveIsLoaded ||
      !isBrandScopeResolved ||
      !isReturningBootstrapRoute ||
      prefillPrompt ||
      activeThreadId ||
      !organizationId ||
      !orgSlug ||
      (isBrandScopedRoute && !brandId) ||
      hasAttemptedReturningBootstrapRef.current
    ) {
      return;
    }

    hasAttemptedReturningBootstrapRef.current = true;
    const controller = new AbortController();
    // Built directly from the route's own brand slug, never from `activeHref`
    // (which falls back to the session-selected brand and, being derived from
    // `useOrgUrl`, is not guaranteed stable across every unrelated re-render).
    const fallbackHref = isBrandScopedRoute
      ? createBrandAppRoute(orgSlug, routeBrandSlug, APP_ROUTES.AGENT.NEW)
      : buildOrganizationNewThreadHref(orgSlug);

    if (isBrandScopedRoute && !routeBrand) {
      replace(fallbackHref);
      return;
    }

    let hasSettled = false;

    void agentApiService
      .getThreads(
        {
          status: AgentThreadStatus.ACTIVE,
          ...(isBrandScopedRoute ? { brandId } : {}),
        },
        controller.signal,
      )
      .then((threads) => {
        hasSettled = true;
        if (controller.signal.aborted) {
          return;
        }

        if (isBrandScopedRoute) {
          const recentBrandThread = mostRecentBrandThread(
            threads,
            organizationId,
            brandId,
          );
          replace(
            recentBrandThread
              ? buildScopedThreadHref(
                  orgSlug,
                  routeBrandSlug,
                  recentBrandThread.id,
                )
              : fallbackHref,
          );
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
        hasSettled = true;
        if (!controller.signal.aborted) {
          replace(fallbackHref);
        }
      });

    return () => {
      controller.abort();
      // This effect only ever needs to run once per qualifying route entry.
      // But if it gets torn down before the lookup settles — an unrelated
      // re-render changed one of these deps while `getThreads` was still in
      // flight — the aborted request never calls `replace`, so release the
      // guard rather than strand the operator on a bare bootstrap route.
      if (!hasSettled) {
        hasAttemptedReturningBootstrapRef.current = false;
      }
    };
  }, [
    activeThreadId,
    agentApiService,
    brandId,
    brands,
    effectiveIsLoaded,
    isBrandScopeResolved,
    isReturningBootstrapRoute,
    organizationId,
    orgSlug,
    prefillPrompt,
    replace,
    routeBrandSlug,
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
  }, [activeThreadId, isJourneyRoute, isUnthreadedRoute, activeHref, replace]);

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
