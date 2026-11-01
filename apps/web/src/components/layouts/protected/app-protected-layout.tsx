'use client';

import LibrarySidebarNav from '@app/(protected)/[orgSlug]/[brandSlug]/library/library-sidebar-nav';
import {
  AppAssetCatalogBoundary,
  renderAppGlobalModal,
} from '@app-i18n/AppGlobalModalIntlBoundary';
import { CommandPaletteProvider } from '@contexts/features/command-palette.provider';
import { AgentDockProvider } from '@contexts/ui/agent-dock-context';
import { useAssetSelection } from '@contexts/ui/asset-selection.context';
import {
  BreadcrumbLeafProvider,
  useBreadcrumbLeaf,
} from '@contexts/ui/breadcrumb-leaf-context';
import { ContextSidebarProvider } from '@contexts/ui/context-sidebar-context';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { hasOrganizationBillingHint } from '@genfeedai/config/license';
import type { AppContext } from '@genfeedai/contracts/interfaces';
import type { LayoutProps } from '@props/layout/layout.props';
import type { ProtectedBootstrapData } from '@props/layout/protected-bootstrap.props';
import type { TopbarProps } from '@props/navigation/topbar.props';
import { logger } from '@services/core/logger.service';
import { ErrorBoundary } from '@ui/display/error-boundary/ErrorBoundary';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import AnalyticsOrganizationSync from '@/components/analytics/AnalyticsOrganizationSync';
import LowCreditsBanner from '@/components/banners/low-credits/LowCreditsBanner';
import ProductionDataBanner from '@/components/banners/production-data/ProductionDataBanner';
import { CommandPaletteInitializer } from '@/components/command-palette/command-palette-initializer/CommandPaletteInitializer';
import OnboardingGuard from '@/components/guards/onboarding/OnboardingGuard';
import IngredientSidebarPanel from '@/components/ingredients/inspector/IngredientSidebarPanel';
import AppLayout from '@/components/layouts/app/AppLayout';
import AppProtectedRail from '@/components/shell/AppProtectedRail';
import AppProtectedTopbar from '@/components/shell/AppProtectedTopbar';
import { InstalledAppsProvider } from '@/components/shell/installed-apps.provider';
import { RailPreferencesProvider } from '@/components/shell/rail-preferences.provider';
import {
  WorkspaceNavPanelProvider,
  WorkspaceNavPanelTarget,
} from '@/components/workspace-shell/WorkspaceNavPanelContext';
import { useSettingsCommandsRegistration } from '@/features/settings/search/use-settings-commands-registration';
import StreakNotificationsBridge from '@/features/streaks/components/StreakNotificationsBridge';
import { useAgentThreadCommands } from '@/hooks/commands/use-agent-thread-commands/use-agent-thread-commands';
import { normalizeProtectedPathname } from '@/lib/navigation/operator-shell';
import {
  captureWorkspaceShellError,
  captureWorkspaceShellPerformance,
} from '@/lib/workspace-shell/workspace-shell-telemetry';
import type { SidebarNavPanel } from '@/props/navigation/menu.props';
import ProtectedProviders from '@/providers/protected-providers/protected-providers';
import AppProtectedLayoutSidebar from './AppProtectedLayoutSidebar';
import {
  extractAgentConversationId,
  extractStoryboardRunId,
  truncateBreadcrumbLabel,
} from './app-protected-layout.breadcrumb';
import AssetGateGuard from './asset-gate-guard';
import GlobalTaskComposer from './GlobalTaskComposer';
import ImpersonationBanner from './impersonation-banner';
import {
  isProtectedEditorCanvasRoute,
  isProtectedWorkspaceRoute,
  useAppProtectedLayout,
} from './useAppProtectedLayout';

const LazyUniversalWorkspaceShell = dynamic(
  () => import('@/components/workspace-shell/UniversalWorkspaceShell'),
  {
    loading: () => null,
  },
);

const LazyCommandPalette = dynamic(
  () =>
    import('@/components/command-palette/command-palette/CommandPalette').then(
      (mod) => mod.CommandPalette,
    ),
  { ssr: false },
);

// Mounted only while an ingredient is selected, so the library catalog the
// inspector needs loads on first use rather than on every protected page.
function IngredientSidebar() {
  const { selectedIngredient } = useAssetSelection();

  if (!selectedIngredient) {
    return null;
  }

  return (
    <AppAssetCatalogBoundary>
      <IngredientSidebarPanel />
    </AppAssetCatalogBoundary>
  );
}

function AdminAppProtectedTopbar(props: TopbarProps) {
  return <AppProtectedTopbar {...props} chrome="admin" currentApp="admin" />;
}

function AgentThreadCommandsBridge({
  threads,
  onNavigate,
}: {
  threads: { id: string; lastMessage?: string; title?: string }[];
  onNavigate: (path: string) => void;
}) {
  useAgentThreadCommands({
    onNavigate,
    threads,
  });

  return null;
}

function SettingsCommandsBridge({ currentApp }: { currentApp?: AppContext }) {
  useSettingsCommandsRegistration(currentApp);

  return null;
}

interface AppLayoutWithDynamicMenuProps extends LayoutProps {
  initialBootstrap?: ProtectedBootstrapData | null;
}

function AppLayoutWithDynamicMenu({
  children,
  initialBootstrap,
}: AppLayoutWithDynamicMenuProps) {
  const translate = useTranslations('pages.organizationLanding');
  const { brands, organizationId, selectedBrand, isBrandScopeResolved } =
    useBrand();
  const sidebarPathname = usePathname();

  const {
    isAdminRoute,
    isAnalyticsRoute,
    isConversationRoute,
    isEditorCanvasRoute,
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
  const isMessagesInboxRoute =
    isMessagesRoute && sidebarPathname.replace(/\/$/, '').endsWith('/messages');
  const messagesNavPanel = useMemo<SidebarNavPanel | null>(
    () =>
      isMessagesInboxRoute
        ? {
            render: () => <WorkspaceNavPanelTarget />,
          }
        : null,
    [isMessagesInboxRoute],
  );
  const activeNavPanel = libraryNavPanel ?? messagesNavPanel;

  const isAppsRoute = /\/~\/apps(\/|$)/.test(sidebarPathname ?? '');
  const menuComponent = useMemo(() => {
    // Editor/workflow canvas routes suppress the Automation/module sidebar so
    // the surface can own the left rail (nodes palette, graph chrome) instead
    // of stacking module menu items under a second logo topbar.
    if (isEditorCanvasRoute) {
      return undefined;
    }

    // Apps and a Studio app with a single page have nothing to navigate
    // between, so they use the full width instead of a one-item menu.
    if (isAppsRoute || (isStudioRoute && studioMenuItems.length <= 1)) {
      return undefined;
    }

    // The agent is chat on the left and its Threads/Context panel on the
    // right; a nav column beside it would be a third pane.
    if (isConversationRoute) {
      return undefined;
    }

    return (
      <AppProtectedLayoutSidebar
        currentApp={currentApp}
        isAdminRoute={isAdminRoute}
        isAnalyticsRoute={isAnalyticsRoute}
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
      />
    );
  }, [
    adminMenuItems,
    analyticsMenuItems,
    currentApp,
    activeNavPanel,
    isAdminRoute,
    isAnalyticsRoute,
    isConversationRoute,
    isEditorCanvasRoute,
    isLibraryRoute,
    isMessagesRoute,
    isOrgRoute,
    isPublishingRoute,
    isDiscoveryRoute,
    isSettingsRoute,
    isAppsRoute,
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

  // The rail is the only app navigation, so every route with shell chrome
  // keeps it — including canvas routes that suppress the module sidebar.
  const railComponent = useMemo(
    () => (
      <AppProtectedRail
        brandSlug={brandSlug}
        isAdminChrome={isAdminRoute}
        orgSlug={orgSlug}
      />
    ),
    [brandSlug, isAdminRoute, orgSlug],
  );
  const topbarComponent = isAdminRoute
    ? AdminAppProtectedTopbar
    : AppProtectedTopbar;
  const navigationMenuItems = isAdminRoute
    ? adminMenuItems
    : isSettingsRoute
      ? settingsMenuItems
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
    !suppressShellLowCreditsBanner &&
    !isLibraryLandingRoute ? (
      <LowCreditsBanner
        isLowBalanceWarningEnabled={isLowCreditsBannerEnabled}
      />
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
  // Storyboard run: Storyboard / <run title, 25 chars>, published by the page.
  const rawPathname = usePathname();
  const breadcrumbLeaf = useBreadcrumbLeaf();
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
    const storyboardRunId = extractStoryboardRunId(rawPathname);
    if (storyboardRunId && breadcrumbLeaf?.key === storyboardRunId) {
      return {
        ...breadcrumb,
        leafLabel: truncateBreadcrumbLabel(breadcrumbLeaf.label),
      };
    }
    return breadcrumb;
  }, [
    breadcrumbLeaf,
    brands,
    organizationId,
    orgSlug,
    rawPathname,
    selectedBrand?.label,
    threads,
    workspaceShellRoute,
  ]);

  // Provided above AppLayout on purpose: the inspector rail and the context
  // sidebar live inside the workspace shell (AppLayout's child) but their
  // toggle renders in the topbar (AppLayout's sibling prop), so the shared
  // state has to sit above both.
  const mainLayout = (
    <AgentDockProvider>
      <ContextSidebarProvider>
        <IngredientSidebar />
        <AppLayout
          bannerComponent={shellBanner}
          breadcrumb={layoutBreadcrumb}
          brandSlug={brandSlug}
          currentApp={currentApp}
          menuComponent={menuComponent}
          railComponent={railComponent}
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
                {brandSlug &&
                isBrandScopeResolved &&
                !brands.some((brand) => brand.slug === brandSlug) ? (
                  <div className="p-6">{translate('brandUnavailable')}</div>
                ) : (
                  children
                )}
              </LazyUniversalWorkspaceShell>
            ) : null
          ) : brandSlug &&
            isBrandScopeResolved &&
            !brands.some((brand) => brand.slug === brandSlug) ? (
            <div className="p-6">{translate('brandUnavailable')}</div>
          ) : (
            children
          )}
        </AppLayout>
      </ContextSidebarProvider>
    </AgentDockProvider>
  );
  // Permanent frame, permanent boundary: a render failure anywhere under it is
  // contained the same way on every route, not only where the shell booted.
  const guardedMainLayout = (
    <ErrorBoundary
      presentation="inline"
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
      {!isEditorCanvasRoute ? (
        <StreakNotificationsBridge initialStreak={initialBootstrap?.streak} />
      ) : null}
      <CommandPaletteProvider>
        {/* Admin is an isolated control plane and intentionally has no Agent
          thread commands. */}
        {isAdminRoute ? null : (
          <AgentThreadCommandsBridge
            threads={threads}
            onNavigate={handleNavigate}
          />
        )}
        <CommandPaletteInitializer />
        <SettingsCommandsBridge currentApp={currentApp} />
        {guardedMainLayout}
        <GlobalTaskComposer />
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
        renderModal={renderAppGlobalModal}
        includeAssetSelectionProvider={!isEditorCanvasRoute}
        includeApiStatusCheck={false}
        includeElementsProvider={!isEditorCanvasRoute && !isWorkspaceRoute}
        initialBootstrap={initialBootstrap}
        includePromptBarProvider={!isEditorCanvasRoute && !isWorkspaceRoute}
      >
        <InstalledAppsProvider>
          <RailPreferencesProvider>
            <BreadcrumbLeafProvider>
              <AppLayoutWithDynamicMenu initialBootstrap={initialBootstrap}>
                <OnboardingGuard>
                  <AssetGateGuard>{children}</AssetGateGuard>
                </OnboardingGuard>
              </AppLayoutWithDynamicMenu>
            </BreadcrumbLeafProvider>
          </RailPreferencesProvider>
        </InstalledAppsProvider>
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
