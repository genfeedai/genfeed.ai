'use client';

import LibrarySidebarNav from '@app/(protected)/[orgSlug]/[brandSlug]/library/library-sidebar-nav';
import StreakNotificationsBridge from '@app-components/streaks/StreakNotificationsBridge';
import { CommandPaletteProvider } from '@contexts/features/command-palette.provider';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  getBrandEntityId,
  getBrandOrganizationSlug,
} from '@contexts/user/brand-context/brand-context.helpers';
import type { AgentThread, AgentThreadListProps } from '@genfeedai/agent';
import { hasOrganizationBillingHint } from '@genfeedai/config/license';
import {
  APP_ROUTES,
  createBrandAppRoute,
  createOrganizationAppRoute,
} from '@genfeedai/constants';
import type { SidebarNavPanel } from '@genfeedai/props/navigation/menu.props';
import { useAgentThreadCommands } from '@hooks/commands/use-agent-thread-commands/use-agent-thread-commands';
import type { LayoutProps } from '@props/layout/layout.props';
import type { ProtectedBootstrapData } from '@props/layout/protected-bootstrap.props';
import type { TopbarProps } from '@props/navigation/topbar.props';
import ProtectedProviders from '@providers/protected-providers/protected-providers';
import { logger } from '@services/core/logger.service';
import LowCreditsBanner from '@ui/banners/low-credits/LowCreditsBanner';
import ProductionDataBanner from '@ui/banners/production-data/ProductionDataBanner';
import { CommandPaletteInitializer } from '@ui/command-palette/command-palette-initializer/CommandPaletteInitializer';
import { ErrorBoundary } from '@ui/error/ErrorBoundary';
import OnboardingGuard from '@ui/guards/onboarding/OnboardingGuard';
import AppLayout from '@ui/layouts/app/AppLayout';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import {
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import AnalyticsOrganizationSync from '@/components/analytics/AnalyticsOrganizationSync';
import AppProtectedTopbar from '@/components/shell/AppProtectedTopbar';
import { WorkspaceInspectorProvider } from '@/components/workspace-shell/WorkspaceInspectorContext';
import {
  useWorkspaceNavPanel,
  WorkspaceNavPanelProvider,
} from '@/components/workspace-shell/WorkspaceNavPanelContext';
import {
  isFocusedOnboardingPath,
  normalizeProtectedPathname,
} from '@/lib/navigation/operator-shell';
import {
  captureWorkspaceShellError,
  captureWorkspaceShellPerformance,
} from '@/lib/workspace-shell/workspace-shell-telemetry';
import AgentSidebarContent from './AppProtectedLayoutAgentSidebar';
import AppProtectedLayoutSidebar from './AppProtectedLayoutSidebar';
import {
  extractAgentConversationId,
  truncateBreadcrumbLabel,
} from './app-protected-layout.breadcrumb';
import AssetGateGuard from './asset-gate-guard';
import ImpersonationBanner from './impersonation-banner';
import {
  isProtectedEditorCanvasRoute,
  isProtectedWorkspaceRoute,
  useAppProtectedLayout,
} from './useAppProtectedLayout';

const LazyAgentThreadList = dynamic<AgentThreadListProps>(
  () => import('@genfeedai/agent').then((mod) => mod.AgentThreadList),
  {
    // Mirror AgentThreadListEmptyState's loading spinner so the
    // import-pending and data-loading phases render identically instead of
    // flashing empty → spinner → list.
    loading: () => (
      <div
        data-testid="agent-thread-list-loading"
        className="flex items-center justify-center p-8"
        aria-busy="true"
      >
        <div className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    ),
    ssr: false,
  },
);

const LazyUniversalWorkspaceShell = dynamic(
  () => import('@/components/workspace-shell/UniversalWorkspaceShell'),
  {
    loading: () => null,
  },
);

const LazyCommandPalette = dynamic(
  () =>
    import('@ui/command-palette/command-palette/CommandPalette').then(
      (mod) => mod.CommandPalette,
    ),
  { ssr: false },
);

function AdminAppProtectedTopbar(props: TopbarProps) {
  return <AppProtectedTopbar {...props} chrome="admin" currentApp="admin" />;
}

function AgentThreadCommandsBridge({
  threads,
  enabled,
  onNavigate,
}: {
  threads: { id: string; lastMessage?: string; title?: string }[];
  enabled: boolean;
  onNavigate: (path: string) => void;
}) {
  useAgentThreadCommands({
    enabled,
    onNavigate,
    threads,
  });

  return null;
}

interface AppLayoutWithDynamicMenuProps extends LayoutProps {
  initialBootstrap?: ProtectedBootstrapData | null;
}

function AppLayoutWithDynamicMenu({
  children,
  initialBootstrap,
}: AppLayoutWithDynamicMenuProps) {
  const { brandId, brands, organizationId, selectedBrand } = useBrand();
  const workspaceNavPanel = useWorkspaceNavPanel();

  const {
    isAdminRoute,
    isAnalyticsRoute,
    isConversationRoute,
    isEditorCanvasRoute,
    isFocusedOnboardingRoute,
    isLibraryLandingRoute,
    isLibraryRoute,
    isMessagesRoute,
    isOrgRoute,
    suppressShellLowCreditsBanner,
    isDiscoveryRoute,
    isSettingsRoute,
    isStudioRoute,
    isAutomationRoute,
    currentApp,
    orgSlug,
    brandSlug,
    settingsScope,
    agentApiService,
    threads,
    agentMenuItems,
    adminMenuItems,
    analyticsMenuItems,
    libraryMenuItems,
    menuItems,
    orgMenuItems,
    publishingMenuItems,
    discoveryMenuItems,
    secondaryMenuItems,
    settingsMenuItems,
    studioMenuItems,
    automationMenuItems,
    messagesMenuItems,
    isPublishingRoute,
    handleNavigate,
    handleOpenCommandPalette,
    isLowCreditsBannerEnabled,
    isDesktopShell,
    isUniversalWorkspaceShell,
    workspaceShellRoute,
  } = useAppProtectedLayout(initialBootstrap);
  // Whether the workspace shell body is up — not whether the app has a frame.
  // The frame is permanent: sidebar, topbar and error boundary are decided by
  // the route alone, so nothing below waits on this to render chrome.
  const isWorkspaceShellMounted =
    isUniversalWorkspaceShell && agentApiService !== null;
  const hasCapturedPerformanceRef = useRef(false);

  useEffect(() => {
    if (
      hasCapturedPerformanceRef.current ||
      !isWorkspaceShellMounted ||
      typeof performance === 'undefined'
    ) {
      return;
    }

    hasCapturedPerformanceRef.current = true;
    captureWorkspaceShellPerformance({
      deviceClass:
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(max-width: 767px)').matches
          ? 'mobile'
          : 'desktop',
      durationMs: Math.max(0, Math.round(performance.now())),
      routeClass: workspaceShellRoute?.telemetryClass ?? 'management',
    });
  }, [isWorkspaceShellMounted, workspaceShellRoute?.telemetryClass]);

  const resolveAgentThreadHref = useCallback(
    (thread: AgentThread) => {
      const ownerBrand = thread.brandId
        ? brands.find((brand) => getBrandEntityId(brand) === thread.brandId)
        : undefined;
      const ownerOrgSlug = getBrandOrganizationSlug(ownerBrand) || orgSlug;

      if (!ownerOrgSlug) {
        return `${APP_ROUTES.AGENT.ROOT}/${thread.id}`;
      }

      return ownerBrand?.slug
        ? createBrandAppRoute(
            ownerOrgSlug,
            ownerBrand.slug,
            `${APP_ROUTES.AGENT.ROOT}/${thread.id}`,
          )
        : createOrganizationAppRoute(
            ownerOrgSlug,
            `${APP_ROUTES.AGENT.ROOT}/${thread.id}`,
          );
    },
    [brands, orgSlug],
  );

  const renderConversations = useCallback(
    (searchAction?: ReactNode) =>
      agentApiService ? (
        <LazyAgentThreadList
          apiService={agentApiService}
          brandId={brandId || null}
          onNavigate={handleNavigate}
          resolveThreadHref={resolveAgentThreadHref}
          searchAction={searchAction}
          showTitle
        />
      ) : null,
    [agentApiService, brandId, handleNavigate, resolveAgentThreadHref],
  );

  // Keep nav-panel *identity* stable across renders. The panel object is
  // handed into menuComponent; recreating it remounts the sidebar body.
  // Closures read latest callbacks via refs so deps stay route-only.
  const renderConversationsRef = useRef(renderConversations);
  renderConversationsRef.current = renderConversations;
  const conversationNavPanel = useMemo<SidebarNavPanel | null>(() => {
    if (!isConversationRoute) {
      return null;
    }

    // Stable identity for the factory passed into AgentSidebarContent — if
    // this were an inline arrow recreated inside render(), every shell
    // re-render would look like a prop change on the sidebar body.
    const stableRenderConversations = (searchAction?: ReactNode) =>
      renderConversationsRef.current(searchAction);

    return {
      render: () => (
        <AgentSidebarContent renderConversations={stableRenderConversations} />
      ),
    };
  }, [isConversationRoute]);
  // Render Library nav in-shell (not via portal). The empty-portal pattern left
  // the column blank when portalTarget never attached (refresh, race, layout
  // order). LibrarySidebarNav is self-contained and does not need the page tree.
  const libraryNavPanel = useMemo<SidebarNavPanel | null>(
    () =>
      isLibraryRoute
        ? {
            render: () => (
              <div
                className="flex h-full min-h-0 flex-col"
                data-testid="library-nav-panel"
              >
                <LibrarySidebarNav />
              </div>
            ),
            sectionLabel: 'Library',
          }
        : null,
    [isLibraryRoute],
  );
  const setMessagesNavPortalTarget = workspaceNavPanel?.setPortalTarget;
  const messagesNavPanel = useMemo<SidebarNavPanel | null>(() => {
    if (!isMessagesRoute || !setMessagesNavPortalTarget) {
      return null;
    }

    return {
      render: () => (
        <div
          className="flex h-full min-h-0 flex-col"
          data-testid="messages-nav-panel"
          ref={setMessagesNavPortalTarget}
        />
      ),
      sectionLabel: 'Messages',
    };
  }, [isMessagesRoute, setMessagesNavPortalTarget]);
  const activeNavPanel =
    conversationNavPanel ?? libraryNavPanel ?? messagesNavPanel;

  const menuComponent = useMemo(() => {
    // Focused onboarding has no module nav. Editor/workflow canvas routes also
    // suppress the Automation/module sidebar so the surface can own the left rail
    // (nodes palette, graph chrome) instead of stacking module menu items under
    // a second logo topbar.
    if (isFocusedOnboardingRoute || isEditorCanvasRoute) {
      return undefined;
    }

    return (
      <AppProtectedLayoutSidebar
        currentApp={currentApp}
        isAdminRoute={isAdminRoute}
        isAnalyticsRoute={isAnalyticsRoute}
        isConversationRoute={isConversationRoute}
        isFocusedOnboardingRoute={isFocusedOnboardingRoute}
        isLibraryRoute={isLibraryRoute}
        isMessagesRoute={isMessagesRoute}
        isOrgRoute={isOrgRoute}
        isPublishingRoute={isPublishingRoute}
        isDiscoveryRoute={isDiscoveryRoute}
        isSettingsRoute={isSettingsRoute}
        isStudioRoute={isStudioRoute}
        isAutomationRoute={isAutomationRoute}
        settingsScope={settingsScope}
        adminMenuItems={adminMenuItems}
        analyticsMenuItems={analyticsMenuItems}
        libraryMenuItems={libraryMenuItems}
        menuItems={menuItems}
        orgMenuItems={orgMenuItems}
        publishingMenuItems={publishingMenuItems}
        discoveryMenuItems={discoveryMenuItems}
        secondaryMenuItems={secondaryMenuItems}
        settingsMenuItems={settingsMenuItems}
        studioMenuItems={studioMenuItems}
        automationMenuItems={automationMenuItems}
        messagesMenuItems={messagesMenuItems}
        navPanel={activeNavPanel}
        onOpenCommandPalette={handleOpenCommandPalette}
      />
    );
  }, [
    adminMenuItems,
    analyticsMenuItems,
    currentApp,
    activeNavPanel,
    handleOpenCommandPalette,
    isAdminRoute,
    isAnalyticsRoute,
    isConversationRoute,
    isEditorCanvasRoute,
    isFocusedOnboardingRoute,
    isLibraryRoute,
    isMessagesRoute,
    isOrgRoute,
    isPublishingRoute,
    isDiscoveryRoute,
    isSettingsRoute,
    isStudioRoute,
    isAutomationRoute,
    libraryMenuItems,
    menuItems,
    messagesMenuItems,
    orgMenuItems,
    publishingMenuItems,
    discoveryMenuItems,
    secondaryMenuItems,
    settingsMenuItems,
    settingsScope,
    studioMenuItems,
    automationMenuItems,
  ]);

  const topbarComponent = isFocusedOnboardingRoute
    ? undefined
    : isAdminRoute
      ? AdminAppProtectedTopbar
      : AppProtectedTopbar;
  const navigationMenuItems = isAdminRoute
    ? adminMenuItems
    : isSettingsRoute
      ? settingsMenuItems
      : isConversationRoute
        ? agentMenuItems
        : isLibraryRoute
          ? libraryMenuItems
          : isStudioRoute
            ? studioMenuItems
            : isAutomationRoute
              ? automationMenuItems
              : isMessagesRoute
                ? messagesMenuItems
                : isAnalyticsRoute
                  ? analyticsMenuItems
                  : isDiscoveryRoute
                    ? discoveryMenuItems
                    : isOrgRoute
                      ? orgMenuItems
                      : menuItems;
  const lowCreditsBanner =
    hasOrganizationBillingHint() &&
    isLowCreditsBannerEnabled &&
    !isFocusedOnboardingRoute &&
    !suppressShellLowCreditsBanner &&
    !isLibraryLandingRoute ? (
      <LowCreditsBanner />
    ) : null;
  const shellBanner = (
    <>
      {/* Unconditional: the "Viewing as {user}" state must survive every
          route the impersonated session can reach, not a subset. */}
      <ImpersonationBanner />
      {isDesktopShell ? null : <ProductionDataBanner />}
      {lowCreditsBanner}
    </>
  );
  // Brand settings: Settings / <brand label> / <page>.
  // Org settings: Settings / <org label> / <page> (General vs brand Profile).
  // Registry seeds parent as :brandSlug / :orgSlug; prefer live display names.
  // Agent conversation: Agent / <thread title, 25 chars>.
  const rawPathname = usePathname();
  const layoutBreadcrumb = useMemo(() => {
    const breadcrumb = workspaceShellRoute?.breadcrumb;
    if (!breadcrumb) {
      return undefined;
    }
    if (
      workspaceShellRoute?.surfaceKey === 'brand-settings' &&
      selectedBrand?.label
    ) {
      return {
        ...breadcrumb,
        parentLabel: selectedBrand.label,
      };
    }
    if (workspaceShellRoute?.surfaceKey === 'organization-settings') {
      const nestedOrg = brands
        .map((brand) => brand.organization)
        .find((organization) => {
          if (!organization || typeof organization !== 'object') {
            return false;
          }
          const record = organization as {
            id?: string;
            label?: string;
            slug?: string;
          };
          if (organizationId && record.id === organizationId) {
            return true;
          }
          if (orgSlug && record.slug === orgSlug) {
            return true;
          }
          return Boolean(record.label);
        }) as { label?: string; slug?: string } | undefined;

      const organizationLabel =
        nestedOrg?.label ||
        (orgSlug
          ? orgSlug
              .split('-')
              .filter(Boolean)
              .map(
                (part) =>
                  `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`,
              )
              .join(' ')
          : undefined);

      if (organizationLabel) {
        return {
          ...breadcrumb,
          parentLabel: organizationLabel,
        };
      }
    }
    if (workspaceShellRoute?.surfaceKey === 'agent-conversation') {
      const conversationId = extractAgentConversationId(rawPathname);
      if (conversationId) {
        const thread = threads.find((item) => item.id === conversationId);
        const title = thread?.title?.trim();
        if (title) {
          return {
            ...breadcrumb,
            leafLabel: truncateBreadcrumbLabel(title, 25),
          };
        }
      }
    }
    return breadcrumb;
  }, [
    brands,
    organizationId,
    orgSlug,
    rawPathname,
    selectedBrand?.label,
    threads,
    workspaceShellRoute,
  ]);

  // Provided above AppLayout on purpose: the inspector rail lives inside the
  // workspace shell (AppLayout's child) but its collapse toggle renders in the
  // topbar (AppLayout's sibling prop), so the shared state has to sit above both.
  const mainLayout = (
    <WorkspaceInspectorProvider>
      <AppLayout
        bannerComponent={shellBanner}
        breadcrumb={layoutBreadcrumb}
        brandSlug={brandSlug}
        currentApp={currentApp}
        menuComponent={menuComponent}
        topbarComponent={topbarComponent}
        menuItems={navigationMenuItems}
        orgSlug={orgSlug}
        isWorkspaceShell={isWorkspaceShellMounted}
        // Agent conversation owns its own thread scroller. Lock the shell so
        // the credits banner cannot push min-h page content past the viewport
        // (document scrollbar + thread scrollbar).
        lockViewportHeight={isConversationRoute}
      >
        {/* The shell is the body of a frame that is already there, so a route
          it does not know still renders — it just renders without the
          inspector rail rather than without an application around it. */}
        {isUniversalWorkspaceShell ? (
          agentApiService ? (
            <LazyUniversalWorkspaceShell agentApiService={agentApiService}>
              {children}
            </LazyUniversalWorkspaceShell>
          ) : null
        ) : (
          children
        )}
      </AppLayout>
    </WorkspaceInspectorProvider>
  );
  // Permanent frame, permanent boundary: a render failure anywhere under it is
  // contained the same way on every route, not only where the shell booted.
  const guardedMainLayout = (
    <ErrorBoundary
      onError={(error) => {
        captureWorkspaceShellError('render', 'render_failed');
        logger.error('Protected shell render failed', {
          error,
          reportToSentry: true,
        });
      }}
    >
      {mainLayout}
    </ErrorBoundary>
  );

  return (
    <>
      <AnalyticsOrganizationSync />
      {!isEditorCanvasRoute && !isFocusedOnboardingRoute ? (
        <StreakNotificationsBridge initialStreak={initialBootstrap?.streak} />
      ) : null}
      <CommandPaletteProvider>
        {/* Admin is an isolated control plane and intentionally has no Agent
          thread commands. Focused onboarding has no palette to put them in. */}
        {isFocusedOnboardingRoute || isAdminRoute ? null : (
          <AgentThreadCommandsBridge
            threads={threads}
            enabled
            onNavigate={handleNavigate}
          />
        )}
        <CommandPaletteInitializer />
        {guardedMainLayout}
        <LazyCommandPalette />
      </CommandPaletteProvider>
    </>
  );
}

interface AppProtectedLayoutProps extends LayoutProps {
  initialBootstrap?: ProtectedBootstrapData | null;
}

function AppProtectedLayoutContent({
  children,
  initialBootstrap,
}: AppProtectedLayoutProps) {
  const rawPathname = usePathname();
  const pathname = useMemo(
    () => normalizeProtectedPathname(rawPathname),
    [rawPathname],
  );
  const isEditorCanvasRoute = isProtectedEditorCanvasRoute(pathname);
  const isFocusedOnboardingRoute = isFocusedOnboardingPath(pathname);
  const isWorkspaceRoute = isProtectedWorkspaceRoute(pathname);

  return (
    <WorkspaceNavPanelProvider>
      <ProtectedProviders
        includeAssetSelectionProvider={!isEditorCanvasRoute}
        includeApiStatusCheck={false}
        includeElementsProvider={
          !isEditorCanvasRoute && !isFocusedOnboardingRoute && !isWorkspaceRoute
        }
        initialBootstrap={initialBootstrap}
        includePromptBarProvider={
          !isEditorCanvasRoute && !isFocusedOnboardingRoute && !isWorkspaceRoute
        }
      >
        <AppLayoutWithDynamicMenu initialBootstrap={initialBootstrap}>
          <OnboardingGuard>
            <AssetGateGuard>{children}</AssetGateGuard>
          </OnboardingGuard>
        </AppLayoutWithDynamicMenu>
      </ProtectedProviders>
    </WorkspaceNavPanelProvider>
  );
}

export default function AppProtectedLayout(
  props: Parameters<typeof AppProtectedLayoutContent>[0],
) {
  return (
    <Suspense fallback={null}>
      <AppProtectedLayoutContent {...props} />
    </Suspense>
  );
}
