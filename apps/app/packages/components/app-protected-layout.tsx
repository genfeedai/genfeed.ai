'use client';

import StreakNotificationsBridge from '@app-components/streaks/StreakNotificationsBridge';
import { CommandPaletteProvider } from '@contexts/features/command-palette.provider';
import type { AgentApiService } from '@genfeedai/agent';
import { isEEEnabled } from '@genfeedai/config/license';
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
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
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
import AppProtectedTopbar from '@/components/shell/AppProtectedTopbar';
import { WorkspaceInspectorProvider } from '@/components/workspace-shell/WorkspaceInspectorContext';
import {
  useWorkspaceNavPanel,
  WorkspaceNavPanelProvider,
} from '@/components/workspace-shell/WorkspaceNavPanelContext';
import { normalizeProtectedPathname } from '@/lib/navigation/operator-shell';
import {
  captureWorkspaceShellError,
  captureWorkspaceShellPerformance,
} from '@/lib/workspace-shell/workspace-shell-telemetry';
import AgentSidebarContent from './AppProtectedLayoutAgentSidebar';
import AppProtectedLayoutSidebar from './AppProtectedLayoutSidebar';
import AssetGateGuard from './asset-gate-guard';
import {
  isProtectedEditorCanvasRoute,
  isProtectedWorkspaceRoute,
  useAppProtectedLayout,
} from './useAppProtectedLayout';

type AgentThreadListProps = {
  apiService: AgentApiService;
  isActive?: boolean;
  onActionsChange?: (actions: ReactNode) => void;
  onNavigate?: (path: string) => void;
};

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
    loading: () => <LazyLoadingFallback variant="grid" />,
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
  const shellChromeVariant = 'default' as const;

  const {
    isAdminRoute,
    isAnalyticsRoute,
    isComposeRoute,
    isConversationRoute,
    isEditorCanvasRoute,
    isEditorRoute,
    isFocusedOnboardingRoute,
    isLibraryLandingRoute,
    isLibraryRoute,
    isMessagesRoute,
    isOrgRoute,
    isPromptBarRoute,
    isResearchRoute,
    isSettingsRoute,
    isStudioRoute,
    isWorkflowsRoute,
    hasSecondaryTopbar,
    currentApp,
    orgSlug,
    brandSlug,
    agentApiService,
    threads,
    agentMenuItems,
    adminMenuItems,
    analyticsMenuItems,
    composeMenuItems,
    libraryMenuItems,
    menuItems,
    orgMenuItems,
    researchMenuItems,
    secondaryMenuItems,
    settingsMenuItems,
    studioMenuItems,
    workflowsMenuItems,
    taskContextSearchParams,
    conversationActions,
    setConversationActions,
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
      shellMode: 'conversation',
    });
  }, [isWorkspaceShellMounted, workspaceShellRoute?.telemetryClass]);

  const renderConversations = useCallback(
    () =>
      agentApiService ? (
        <LazyAgentThreadList
          apiService={agentApiService}
          onNavigate={handleNavigate}
          onActionsChange={setConversationActions}
        />
      ) : null,
    [agentApiService, handleNavigate, setConversationActions],
  );

  // The conversation module's nav column. It is handed to the sidebar as a
  // panel rather than special-cased there, so the next module to own its
  // column (Library → collections, Workflows → runs) uses the same seam.
  const conversationNavPanel = useMemo<SidebarNavPanel | null>(
    () =>
      isConversationRoute
        ? {
            render: () => (
              <AgentSidebarContent
                conversationActions={conversationActions}
                renderConversations={renderConversations}
              />
            ),
          }
        : null,
    [conversationActions, isConversationRoute, renderConversations],
  );
  const workspaceNavPanel = useWorkspaceNavPanel();
  const setWorkspaceNavPanelPortalTarget =
    workspaceNavPanel?.setPortalTarget ?? null;
  const messagesNavPanel = useMemo<SidebarNavPanel | null>(
    () =>
      isMessagesRoute && setWorkspaceNavPanelPortalTarget
        ? {
            render: () => (
              <div
                className="flex h-full min-h-0 flex-col"
                data-testid="messages-nav-panel"
                ref={setWorkspaceNavPanelPortalTarget}
              />
            ),
            sectionLabel: 'Messages',
          }
        : null,
    [isMessagesRoute, setWorkspaceNavPanelPortalTarget],
  );
  const activeNavPanel = conversationNavPanel ?? messagesNavPanel;

  const menuComponent = useMemo(() => {
    // Only the focused onboarding flow runs without navigation. Canvas surfaces
    // — the editor, a workflow graph, the moodboard — keep the frame they are
    // rendered inside; they used to lose it whenever the shell had not booted.
    if (isFocusedOnboardingRoute) {
      return undefined;
    }

    return (
      <AppProtectedLayoutSidebar
        shellChromeVariant={shellChromeVariant}
        taskContextSearchParams={taskContextSearchParams}
        currentApp={currentApp}
        isAdminRoute={isAdminRoute}
        isAnalyticsRoute={isAnalyticsRoute}
        isComposeRoute={isComposeRoute}
        isConversationRoute={isConversationRoute}
        isEditorRoute={isEditorRoute}
        isFocusedOnboardingRoute={isFocusedOnboardingRoute}
        isLibraryRoute={isLibraryRoute}
        isMessagesRoute={isMessagesRoute}
        isOrgRoute={isOrgRoute}
        isResearchRoute={isResearchRoute}
        isSettingsRoute={isSettingsRoute}
        isStudioRoute={isStudioRoute}
        isWorkflowsRoute={isWorkflowsRoute}
        adminMenuItems={adminMenuItems}
        analyticsMenuItems={analyticsMenuItems}
        composeMenuItems={composeMenuItems}
        libraryMenuItems={libraryMenuItems}
        menuItems={menuItems}
        orgMenuItems={orgMenuItems}
        researchMenuItems={researchMenuItems}
        secondaryMenuItems={secondaryMenuItems}
        settingsMenuItems={settingsMenuItems}
        studioMenuItems={studioMenuItems}
        workflowsMenuItems={workflowsMenuItems}
        navPanel={activeNavPanel}
        onOpenCommandPalette={handleOpenCommandPalette}
      />
    );
  }, [
    adminMenuItems,
    analyticsMenuItems,
    composeMenuItems,
    currentApp,
    activeNavPanel,
    handleOpenCommandPalette,
    isAdminRoute,
    isAnalyticsRoute,
    isComposeRoute,
    isConversationRoute,
    isEditorRoute,
    isFocusedOnboardingRoute,
    isLibraryRoute,
    isMessagesRoute,
    isOrgRoute,
    isResearchRoute,
    isSettingsRoute,
    isStudioRoute,
    isWorkflowsRoute,
    libraryMenuItems,
    menuItems,
    orgMenuItems,
    researchMenuItems,
    secondaryMenuItems,
    settingsMenuItems,
    shellChromeVariant,
    studioMenuItems,
    taskContextSearchParams,
    workflowsMenuItems,
  ]);

  const topbarComponent = isFocusedOnboardingRoute
    ? undefined
    : isAdminRoute
      ? AdminAppProtectedTopbar
      : AppProtectedTopbar;
  const topbarChromeVariant = 'default';
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
            : isComposeRoute
              ? composeMenuItems
              : isWorkflowsRoute
                ? workflowsMenuItems
                : isAnalyticsRoute
                  ? analyticsMenuItems
                  : isResearchRoute
                    ? researchMenuItems
                    : isOrgRoute
                      ? orgMenuItems
                      : menuItems;
  const lowCreditsBanner =
    isEEEnabled() &&
    isLowCreditsBannerEnabled &&
    !isFocusedOnboardingRoute &&
    !isPromptBarRoute &&
    !isLibraryLandingRoute ? (
      <LowCreditsBanner />
    ) : null;
  const shellBanner = (
    <>
      {isDesktopShell ? null : <ProductionDataBanner />}
      {lowCreditsBanner}
    </>
  );
  // Provided above AppLayout on purpose: the inspector rail lives inside the
  // workspace shell (AppLayout's child) but its collapse toggle renders in the
  // topbar (AppLayout's sibling prop), so the shared state has to sit above both.
  const mainLayout = (
    <WorkspaceInspectorProvider>
      <AppLayout
        bannerComponent={shellBanner}
        breadcrumb={workspaceShellRoute?.breadcrumb}
        brandSlug={brandSlug}
        currentApp={currentApp}
        menuComponent={menuComponent}
        topbarComponent={topbarComponent}
        shellChromeVariant={shellChromeVariant}
        topbarChromeVariant={topbarChromeVariant}
        hasSecondaryTopbar={hasSecondaryTopbar}
        menuItems={navigationMenuItems}
        orgSlug={orgSlug}
        isWorkspaceShell={isWorkspaceShellMounted}
      >
        {/* The shell is the body of a frame that is already there, so a route
          it does not know still renders — it just renders without the
          inspector rail rather than without an application around it. */}
        {isUniversalWorkspaceShell ? (
          agentApiService ? (
            <LazyUniversalWorkspaceShell agentApiService={agentApiService}>
              {children}
            </LazyUniversalWorkspaceShell>
          ) : (
            <LazyLoadingFallback variant="grid" />
          )
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
      {!isEditorCanvasRoute && !isFocusedOnboardingRoute ? (
        <StreakNotificationsBridge initialStreak={initialBootstrap?.streak} />
      ) : null}
      <CommandPaletteProvider>
        {/* The conversation is reachable from every surface, so its threads
          belong in the palette on every surface — the focused onboarding flow
          being the one place with no palette to put them in. */}
        {isFocusedOnboardingRoute ? null : (
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
  const isWorkspaceRoute = isProtectedWorkspaceRoute(pathname);

  return (
    <WorkspaceNavPanelProvider>
      <ProtectedProviders
        includeAssetSelectionProvider={!isEditorCanvasRoute}
        includeApiStatusCheck={false}
        includeElementsProvider={!isEditorCanvasRoute && !isWorkspaceRoute}
        initialBootstrap={initialBootstrap}
        includePromptBarProvider={!isEditorCanvasRoute && !isWorkspaceRoute}
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
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <AppProtectedLayoutContent {...props} />
    </Suspense>
  );
}
