'use client';

import StreakNotificationsBridge from '@app-components/streaks/StreakNotificationsBridge';
import { CommandPaletteProvider } from '@contexts/features/command-palette.provider';
import type { AgentApiService } from '@genfeedai/agent';
import { useAgentThreadCommands } from '@hooks/commands/use-agent-thread-commands/use-agent-thread-commands';
import type { LayoutProps } from '@props/layout/layout.props';
import type { ProtectedBootstrapData } from '@props/layout/protected-bootstrap.props';
import ProtectedProviders from '@providers/protected-providers/protected-providers';
import LowCreditsBanner from '@ui/banners/low-credits/LowCreditsBanner';
import ProductionDataBanner from '@ui/banners/production-data/ProductionDataBanner';
import { CommandPaletteInitializer } from '@ui/command-palette/command-palette-initializer/CommandPaletteInitializer';
import OnboardingGuard from '@ui/guards/onboarding/OnboardingGuard';
import AppLayout from '@ui/layouts/app/AppLayout';
import AdminTopbar from '@ui/shell/topbars/AdminTopbar';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { type ReactNode, Suspense, useCallback, useMemo } from 'react';

import AppProtectedTopbar from '@/components/shell/AppProtectedTopbar';
import { isEEEnabled } from '@/lib/config/edition';
import { normalizeProtectedPathname } from '@/lib/navigation/operator-shell';

import AppProtectedLayoutSidebar from './AppProtectedLayoutSidebar';
import {
  isProtectedEditorCanvasRoute,
  isProtectedWorkspaceRoute,
  useAppProtectedLayout,
} from './useAppProtectedLayout';

type AgentPanelProps = {
  apiService: AgentApiService;
  isActive?: boolean;
  onNavigateToBilling?: () => void;
  onOAuthConnect?: (platform: string) => void;
  onSelectCreditPack?: (pack: {
    label: string;
    price: string;
    credits: number;
  }) => void;
};

type AgentThreadListProps = {
  apiService: AgentApiService;
  isActive?: boolean;
  onActionsChange?: (actions: ReactNode) => void;
  onNavigate?: (path: string) => void;
};

const LazyAgentPanel = dynamic<AgentPanelProps>(
  () => import('@genfeedai/agent').then((mod) => mod.AgentPanel),
  {
    loading: () => (
      <div data-prompt-layout-mode="surface-fixed" data-testid="agent-panel" />
    ),
    ssr: false,
  },
);

const LazyAgentThreadList = dynamic<AgentThreadListProps>(
  () => import('@genfeedai/agent').then((mod) => mod.AgentThreadList),
  {
    loading: () => null,
    ssr: false,
  },
);

const LazyCommandPalette = dynamic(
  () =>
    import('@ui/command-palette/command-palette/CommandPalette').then(
      (mod) => mod.CommandPalette,
    ),
  { ssr: false },
);

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
    isAgentOpen,
    toggleAgent,
    threads,
    shouldMountAgentPanel,
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
    handleNavigateToBilling,
    handleOpenCommandPalette,
    isLowCreditsBannerEnabled,
    isDesktopShell,
  } = useAppProtectedLayout(initialBootstrap);

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
    if (isFocusedOnboardingRoute || isEditorCanvasRoute || isMoodboardRoute) {
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
    isEditorCanvasRoute || isFocusedOnboardingRoute || isMoodboardRoute
      ? undefined
      : isAdminRoute
        ? AdminTopbar
        : AppProtectedTopbar;
  const topbarChromeVariant = 'default';
  const agentPanel =
    !shouldMountAgentPanel || !agentApiService ? undefined : (
      <LazyAgentPanel
        apiService={agentApiService}
        isActive={isAgentOpen}
        onNavigateToBilling={handleNavigateToBilling}
      />
    );

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

  if (isEditorCanvasRoute || isMoodboardRoute) {
    return (
      <CommandPaletteProvider>
        <CommandPaletteInitializer />
        <div className="min-h-screen overflow-hidden bg-background">
          {shellBanner}
          {children}
        </div>
        <LazyCommandPalette />
      </CommandPaletteProvider>
    );
  }

  return (
    <>
      {!isEditorCanvasRoute && !isFocusedOnboardingRoute ? (
        <StreakNotificationsBridge initialStreak={initialBootstrap?.streak} />
      ) : null}
      <CommandPaletteProvider>
        {!isFocusedOnboardingRoute &&
        !isEditorCanvasRoute &&
        isConversationRoute ? (
          <AgentThreadCommandsBridge
            threads={threads}
            enabled
            onNavigate={handleNavigate}
          />
        ) : null}
        <CommandPaletteInitializer />
        <AppLayout
          bannerComponent={shellBanner}
          brandSlug={brandSlug}
          currentApp={currentApp}
          menuComponent={menuComponent}
          topbarComponent={topbarComponent}
          shellChromeVariant={shellChromeVariant}
          topbarChromeVariant={topbarChromeVariant}
          hasSecondaryTopbar={hasSecondaryTopbar}
          menuItems={isAdminRoute ? adminMenuItems : menuItems}
          agentPanel={agentPanel}
          isAgentCollapsed={!isAgentOpen}
          onAgentToggle={shouldMountAgentPanel ? toggleAgent : undefined}
          orgSlug={orgSlug}
        >
          {children}
        </AppLayout>
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
        <OnboardingGuard>{children}</OnboardingGuard>
      </AppLayoutWithDynamicMenu>
    </ProtectedProviders>
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
