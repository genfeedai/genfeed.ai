'use client';

import StreakNotificationsBridge from '@app-components/streaks/StreakNotificationsBridge';
import { CommandPaletteProvider } from '@contexts/features/command-palette.provider';
import type { AgentApiService } from '@genfeedai/agent';
import { isEEEnabled } from '@genfeedai/config/license';
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
import { normalizeProtectedPathname } from '@/lib/navigation/operator-shell';
import {
  captureWorkspaceShellError,
  captureWorkspaceShellPerformance,
} from '@/lib/workspace-shell/workspace-shell-telemetry';
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
    isMoodboardRoute,
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
  const isWorkspaceShellReady =
    isUniversalWorkspaceShell && agentApiService !== null;
  const hasCapturedPerformanceRef = useRef(false);

  useEffect(() => {
    if (
      hasCapturedPerformanceRef.current ||
      !isWorkspaceShellReady ||
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
  }, [isWorkspaceShellReady, workspaceShellRoute?.telemetryClass]);

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

  const menuComponent = useMemo(() => {
    if (
      !isWorkspaceShellReady &&
      (isFocusedOnboardingRoute || isEditorCanvasRoute || isMoodboardRoute)
    ) {
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
        isOrgRoute={isOrgRoute}
        isResearchRoute={isResearchRoute}
        isSettingsRoute={isSettingsRoute}
        isStudioRoute={isStudioRoute}
        isWorkflowsRoute={isWorkflowsRoute}
        isUniversalWorkspaceShell={isWorkspaceShellReady}
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
        conversationActions={conversationActions}
        renderConversations={renderConversations}
        onOpenCommandPalette={handleOpenCommandPalette}
      />
    );
  }, [
    adminMenuItems,
    analyticsMenuItems,
    composeMenuItems,
    currentApp,
    conversationActions,
    handleOpenCommandPalette,
    isAdminRoute,
    isAnalyticsRoute,
    isComposeRoute,
    isConversationRoute,
    isEditorCanvasRoute,
    isEditorRoute,
    isFocusedOnboardingRoute,
    isLibraryRoute,
    isMoodboardRoute,
    isOrgRoute,
    isResearchRoute,
    isSettingsRoute,
    isStudioRoute,
    isWorkflowsRoute,
    isWorkspaceShellReady,
    libraryMenuItems,
    menuItems,
    orgMenuItems,
    researchMenuItems,
    renderConversations,
    secondaryMenuItems,
    settingsMenuItems,
    shellChromeVariant,
    studioMenuItems,
    taskContextSearchParams,
    workflowsMenuItems,
  ]);

  const topbarComponent =
    !isWorkspaceShellReady &&
    (isEditorCanvasRoute || isFocusedOnboardingRoute || isMoodboardRoute)
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
  const mainLayout = (
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
      isWorkspaceShell={isWorkspaceShellReady}
    >
      {isWorkspaceShellReady && agentApiService ? (
        <LazyUniversalWorkspaceShell agentApiService={agentApiService}>
          {children}
        </LazyUniversalWorkspaceShell>
      ) : isUniversalWorkspaceShell ? (
        <LazyLoadingFallback variant="grid" />
      ) : (
        children
      )}
    </AppLayout>
  );
  const guardedMainLayout = isWorkspaceShellReady ? (
    <ErrorBoundary
      onError={(error) => {
        captureWorkspaceShellError('render', 'render_failed');
        logger.error('Conversation shell render failed', {
          error,
          reportToSentry: true,
        });
      }}
    >
      {mainLayout}
    </ErrorBoundary>
  ) : (
    mainLayout
  );

  return (
    <>
      {!isEditorCanvasRoute && !isFocusedOnboardingRoute ? (
        <StreakNotificationsBridge initialStreak={initialBootstrap?.streak} />
      ) : null}
      <CommandPaletteProvider>
        {!isFocusedOnboardingRoute &&
        (!isEditorCanvasRoute || isWorkspaceShellReady) &&
        (isConversationRoute || isWorkspaceShellReady) ? (
          <AgentThreadCommandsBridge
            threads={threads}
            enabled
            onNavigate={handleNavigate}
          />
        ) : null}
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
