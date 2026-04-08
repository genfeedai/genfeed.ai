'use client';

import StreakNotificationsBridge from '@app-components/streaks/StreakNotificationsBridge';
import {
  COMPOSE_LOGO_HREF,
  COMPOSE_MENU_ITEMS,
} from '@app-config/compose-menu-items.config';
import {
  APP_LOGO_HREF,
  APP_MENU_ITEMS,
  getAppSecondaryMenuItems,
  POSTS_INSERT_AFTER_LABEL,
} from '@app-config/menu-items.config';
import {
  ORG_LOGO_HREF,
  ORG_MENU_ITEMS,
} from '@app-config/org-menu-items.config';
import {
  SETTINGS_LOGO_HREF,
  SETTINGS_MENU_ITEMS,
} from '@app-config/settings-menu-items.config';
import {
  STUDIO_LOGO_HREF,
  STUDIO_MENU_ITEMS,
} from '@app-config/studio-menu-items.config';
import { CommandPaletteProvider } from '@contexts/features/command-palette.context';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  AGENT_PANEL_OPEN_KEY,
  AgentApiService,
  useAgentChatStore,
  useAgentPageContext,
} from '@genfeedai/agent';
import { Kbd } from '@genfeedai/ui';
import { resolveClerkToken } from '@helpers/auth/clerk.helper';
import { useUserRole } from '@hooks/auth/use-user-role';
import { useAgentThreadCommands } from '@hooks/commands/use-agent-thread-commands/use-agent-thread-commands';
import {
  STUDIO_CATEGORY_CONFIG,
  useEnabledCategories,
} from '@hooks/data/organization/use-enabled-categories/use-enabled-categories';
import { useFeatureFlag } from '@hooks/feature-flags/use-feature-flag';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useMenuItems } from '@hooks/ui/use-menu-items';
import type { LayoutProps } from '@props/layout/layout.props';
import type { ProtectedBootstrapData } from '@props/layout/protected-bootstrap.props';
import ProtectedProviders from '@providers/protected-providers/protected-providers';
import {
  dispatchAgentPanelStateChanged,
  ENTITY_OVERLAY_CLOSED_EVENT,
  ENTITY_OVERLAY_OPEN_AGENT_REQUESTED_EVENT,
  ENTITY_OVERLAY_OPENED_EVENT,
  type EntityOverlayVisibilityDetail,
  isDesktopAgentViewport,
} from '@services/core/agent-overlay-coordination.service';
import LowCreditsBanner from '@ui/banners/low-credits/LowCreditsBanner';
import ProductionDataBanner from '@ui/banners/production-data/ProductionDataBanner';
import { CommandPalette } from '@ui/command-palette/command-palette/CommandPalette';
import { CommandPaletteInitializer } from '@ui/command-palette/command-palette-initializer/CommandPaletteInitializer';
import OnboardingGuard from '@ui/guards/onboarding/OnboardingGuard';
import AppLayout from '@ui/layouts/app/AppLayout';
import SidebarBackRow from '@ui/menus/sidebar-back-row/SidebarBackRow';
import SidebarSearchTrigger from '@ui/menus/sidebar-search-trigger/SidebarSearchTrigger';
import AppSidebar from '@ui/shell/menus/AppSidebar';
import TopbarShared from '@ui/topbars/shared/TopbarShared';
import { COMPOSE_ROUTES } from '@ui-constants/compose.constant';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { HiPlus } from 'react-icons/hi2';
import { useOptionalAuth } from '@/hooks/useOptionalAuth';
import { isEEEnabled } from '@/lib/config/edition';

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

function ChatSidebarContent({
  conversationActions,
  renderConversations,
}: {
  conversationActions: ReactNode;
  renderConversations: () => ReactNode;
}) {
  const { href, orgHref } = useOrgUrl();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SidebarBackRow label="Workspace" href={href('/workspace/overview')} />

      <div className="flex min-h-0 flex-1 flex-col px-3 pb-2 pt-2">
        <div className="flex items-center justify-between px-3 pb-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/35">
            Conversations
          </span>
          {conversationActions}
        </div>

        <div className="pb-1">
          <Link
            href={orgHref('/chat/new')}
            className="flex h-9 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-white/80 transition-colors duration-200 group cursor-pointer hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <HiPlus className="h-4 w-4 text-white/80 group-hover:text-white" />
            <span className="text-sm font-medium text-white/90">New Chat</span>
            <Kbd
              variant="ghost"
              className="ml-auto text-[11px] opacity-0 transition-opacity duration-200 group-hover:opacity-100"
            >
              ⌘⇧N
            </Kbd>
          </Link>
        </div>

        <div className="min-h-0 flex-1">{renderConversations()}</div>
      </div>
    </div>
  );
}

interface AppLayoutWithDynamicMenuProps extends LayoutProps {
  initialBootstrap?: ProtectedBootstrapData | null;
}

function AppLayoutWithDynamicMenu({
  children,
  initialBootstrap,
}: AppLayoutWithDynamicMenuProps) {
  const shellChromeVariant = 'transparent' as const;
  const rawPathname = usePathname();
  // Strip org/brand prefix from pathname for route detection.
  // Pathname may be /orgSlug/brandSlug/studio or /orgSlug/~/settings.
  const pathname = useMemo(() => {
    const parts = rawPathname.split('/').filter(Boolean);
    if (parts.length >= 3) {
      const knownPrefixes = [
        'workspace',
        'studio',
        'settings',
        'agents',
        'posts',
        'analytics',
        'workflows',
        'library',
        'chat',
        'compose',
        'editor',
        'research',
        'issues',
        'overview',
        'ingredients',
        'videos',
        'edit',
        'orchestration',
        'elements',
        'bots',
      ];
      if (parts[1] === '~' || knownPrefixes.includes(parts[2])) {
        const rest = parts[1] === '~' ? parts.slice(2) : parts.slice(2);
        return `/${rest.join('/')}`;
      }
    }
    return rawPathname;
  }, [rawPathname]);
  const isChatRoute = /^\/chat(?:\/|$)/.test(pathname);
  const isFocusedOnboardingRoute = pathname.startsWith('/chat/onboarding');
  const isComposeRoute = pathname.startsWith(COMPOSE_ROUTES.ROOT);
  const isLibraryLandingRoute = pathname === '/library/ingredients';
  const isStudioPromptBarRoute =
    pathname === '/studio' ||
    /^\/studio\/(avatar|image|music|video)(?:\/|$)/.test(pathname);
  const isStudioRoute = pathname.startsWith('/studio');
  const isPostsPromptBarRoute = pathname === '/posts';
  const isMissionControlPromptBarRoute =
    pathname === '/workflows/executions' || pathname === '/orchestration/runs';
  const isPromptBarRoute =
    isStudioPromptBarRoute ||
    isPostsPromptBarRoute ||
    isMissionControlPromptBarRoute;
  const isOrgRoute = (() => {
    const parts = rawPathname.split('/').filter(Boolean);
    return (
      parts[1] === '~' && !pathname.startsWith('/settings') && !isChatRoute
    );
  })();
  const isSettingsRoute = pathname.startsWith('/settings');
  const hasSecondaryTopbar = pathname.startsWith('/studio');
  const isEditorCanvasRoute =
    pathname === '/editor/new' ||
    /^\/editor\/[^/]+$/.test(pathname) ||
    pathname === '/workflows/new' ||
    /^\/workflows\/[^/]+$/.test(pathname);
  const shouldMountAgentPanel = !isEditorCanvasRoute && !isChatRoute;
  const shouldInitAgentApiService = shouldMountAgentPanel || isChatRoute;

  const router = useRouter();
  const { getToken } = useOptionalAuth();
  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);
  const dynamicMenuItems = useMenuItems({
    insertAfterLabel: POSTS_INSERT_AFTER_LABEL,
    items: APP_MENU_ITEMS,
  });
  const { brandId } = useBrand();
  const agentApiService = useMemo(() => {
    if (!shouldInitAgentApiService) {
      return null;
    }

    return new AgentApiService({
      baseUrl: process.env.NEXT_PUBLIC_API_ENDPOINT ?? '',
      getToken: async () => resolveClerkToken(getTokenRef.current),
    });
  }, [shouldInitAgentApiService]);
  const menuItems = dynamicMenuItems;
  const secondaryMenuItems = useMemo(
    () => getAppSecondaryMenuItems(brandId),
    [brandId],
  );

  const [conversationActions, setConversationActions] =
    useState<ReactNode>(null);
  const isAgentOpen = useAgentChatStore((s) => s.isOpen);
  const beginOverlaySession = useAgentChatStore((s) => s.beginOverlaySession);
  const endOverlaySession = useAgentChatStore((s) => s.endOverlaySession);
  const setIsOpen = useAgentChatStore((s) => s.setIsOpen);
  const toggleAgent = useAgentChatStore((s) => s.toggleOpen);
  const threads = useAgentChatStore((s) => s.threads);

  useEffect(() => {
    if (!shouldMountAgentPanel) {
      return;
    }

    const stored = localStorage.getItem(AGENT_PANEL_OPEN_KEY);
    if (stored !== null) {
      setIsOpen(stored === 'true');
    }
  }, [setIsOpen, shouldMountAgentPanel]);

  useEffect(() => {
    if (!shouldMountAgentPanel) {
      return;
    }

    dispatchAgentPanelStateChanged(isAgentOpen);
  }, [isAgentOpen, shouldMountAgentPanel]);

  useEffect(() => {
    if (!shouldMountAgentPanel || typeof window === 'undefined') {
      return undefined;
    }

    const handleOverlayOpened = (event: Event): void => {
      if (!isDesktopAgentViewport()) {
        return;
      }

      beginOverlaySession(
        (event as CustomEvent<EntityOverlayVisibilityDetail>).detail.overlayId,
      );
    };

    const handleOverlayClosed = (event: Event): void => {
      endOverlaySession(
        (event as CustomEvent<EntityOverlayVisibilityDetail>).detail.overlayId,
      );
    };

    const handleOpenAgentRequested = (): void => {
      if (!isDesktopAgentViewport()) {
        return;
      }

      setIsOpen(true);
    };

    window.addEventListener(ENTITY_OVERLAY_OPENED_EVENT, handleOverlayOpened);
    window.addEventListener(ENTITY_OVERLAY_CLOSED_EVENT, handleOverlayClosed);
    window.addEventListener(
      ENTITY_OVERLAY_OPEN_AGENT_REQUESTED_EVENT,
      handleOpenAgentRequested,
    );

    return () => {
      window.removeEventListener(
        ENTITY_OVERLAY_OPENED_EVENT,
        handleOverlayOpened,
      );
      window.removeEventListener(
        ENTITY_OVERLAY_CLOSED_EVENT,
        handleOverlayClosed,
      );
      window.removeEventListener(
        ENTITY_OVERLAY_OPEN_AGENT_REQUESTED_EVENT,
        handleOpenAgentRequested,
      );
    };
  }, [
    beginOverlaySession,
    endOverlaySession,
    setIsOpen,
    shouldMountAgentPanel,
  ]);
  const role = useUserRole();
  const { enabledCategories, isLoading: isEnabledCategoriesLoading } =
    useEnabledCategories();

  // Sync route context into the agent store
  useAgentPageContext(role);

  const { href: buildHref, orgHref } = useOrgUrl();
  const handleNavigateToBilling = useCallback(() => {
    router.push(
      orgHref(
        isEEEnabled()
          ? '/settings/organization/billing'
          : '/settings/organization/api-keys',
      ),
    );
  }, [router, orgHref]);

  const handleNavigate = useCallback(
    (path: string) => {
      router.push(path);
    },
    [router],
  );
  const handleOpenSidebarSearch = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', metaKey: true }),
    );
  }, []);

  const studioMenuItems = useMemo(() => {
    const categoryByHref = new Map(
      STUDIO_CATEGORY_CONFIG.map(({ category, param, settingKey }) => [
        `/studio/${param}`,
        { category, settingKey },
      ]),
    );

    return STUDIO_MENU_ITEMS.filter((item) => {
      if (!item.href) {
        return true;
      }

      const studioCategory = categoryByHref.get(item.href);

      if (!studioCategory) {
        return true;
      }

      return (
        enabledCategories.includes(studioCategory.category) &&
        (!isEnabledCategoriesLoading || studioCategory.settingKey === null)
      );
    });
  }, [enabledCategories, isEnabledCategoriesLoading]);

  const renderConversations = useCallback(
    () =>
      agentApiService ? (
        <LazyAgentThreadList
          apiService={agentApiService}
          onNavigate={handleNavigate}
          onActionsChange={setConversationActions}
        />
      ) : null,
    [agentApiService, handleNavigate],
  );

  const menuComponent = useMemo(() => {
    if (isFocusedOnboardingRoute) {
      return undefined;
    }

    if (isEditorCanvasRoute) {
      return undefined;
    }

    if (isStudioRoute) {
      return (
        <AppSidebar
          items={studioMenuItems}
          logoHref={buildHref(STUDIO_LOGO_HREF)}
          backHref="/library/ingredients"
          backLabel="Library"
          sectionLabel="Studio"
          shellChromeVariant={shellChromeVariant}
        />
      );
    }

    if (isComposeRoute) {
      return (
        <AppSidebar
          items={COMPOSE_MENU_ITEMS}
          logoHref={buildHref(COMPOSE_LOGO_HREF)}
          backHref="/posts"
          backLabel="Posts"
          sectionLabel="Compose"
          shellChromeVariant={shellChromeVariant}
        />
      );
    }

    if (isOrgRoute) {
      return (
        <AppSidebar
          items={ORG_MENU_ITEMS}
          logoHref={orgHref(ORG_LOGO_HREF)}
          backHref={buildHref('/workspace/overview')}
          backLabel="Workspace"
          sectionLabel="Organization"
          shellChromeVariant={shellChromeVariant}
        />
      );
    }

    if (isSettingsRoute) {
      return (
        <AppSidebar
          items={SETTINGS_MENU_ITEMS}
          logoHref={buildHref(SETTINGS_LOGO_HREF)}
          backHref="/workspace/overview"
          backLabel="Workspace"
          sectionLabel="Settings"
          shellChromeVariant={shellChromeVariant}
        />
      );
    }

    return (
      <AppSidebar
        items={isChatRoute ? [] : menuItems}
        logoHref={buildHref(APP_LOGO_HREF)}
        sectionLabel={isChatRoute ? undefined : 'Workspace'}
        collapsedSidebarWidth={isChatRoute ? undefined : 64}
        mobileSidebarWidth={isChatRoute ? undefined : 304}
        primaryAction={
          isChatRoute
            ? undefined
            : {
                href: '/workspace/overview#new-task',
                icon: <HiPlus className="h-4 w-4" />,
                label: 'New Task',
              }
        }
        renderTopSlot={
          isChatRoute
            ? undefined
            : () => <SidebarSearchTrigger onClick={handleOpenSidebarSearch} />
        }
        secondaryItems={isChatRoute ? undefined : secondaryMenuItems}
        renderBody={
          isChatRoute
            ? () => (
                <ChatSidebarContent
                  conversationActions={conversationActions}
                  renderConversations={renderConversations}
                />
              )
            : undefined
        }
        shellMode={isChatRoute ? 'default' : 'workspace'}
        showPrimaryItems={!isChatRoute}
        showOrganizationSwitcher={!isChatRoute}
        sidebarWidth={isChatRoute ? undefined : 304}
        shellChromeVariant={shellChromeVariant}
      />
    );
  }, [
    buildHref,
    orgHref,
    conversationActions,
    menuItems,
    isComposeRoute,
    isEditorCanvasRoute,
    isOrgRoute,
    isSettingsRoute,
    isStudioRoute,
    renderConversations,
    handleOpenSidebarSearch,
    isFocusedOnboardingRoute,
    isChatRoute,
    shellChromeVariant,
    secondaryMenuItems,
    studioMenuItems,
  ]);

  const topbarComponent =
    isEditorCanvasRoute || isFocusedOnboardingRoute ? undefined : TopbarShared;
  const topbarChromeVariant = 'default';
  const agentPanel =
    !shouldMountAgentPanel || !agentApiService ? undefined : (
      <LazyAgentPanel
        apiService={agentApiService}
        isActive={isAgentOpen}
        onNavigateToBilling={handleNavigateToBilling}
      />
    );
  const isLowCreditsBannerEnabled = useFeatureFlag('low_credits_banner');
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
      <ProductionDataBanner />
      {lowCreditsBanner}
    </>
  );

  if (isEditorCanvasRoute) {
    return (
      <CommandPaletteProvider>
        <CommandPaletteInitializer />
        <div className="min-h-screen overflow-hidden bg-background">
          {shellBanner}
          {children}
        </div>
        <CommandPalette />
      </CommandPaletteProvider>
    );
  }

  return (
    <>
      {!isEditorCanvasRoute && !isFocusedOnboardingRoute ? (
        <StreakNotificationsBridge initialStreak={initialBootstrap?.streak} />
      ) : null}
      <CommandPaletteProvider>
        {!isFocusedOnboardingRoute && !isEditorCanvasRoute && isChatRoute ? (
          <AgentThreadCommandsBridge
            threads={threads}
            enabled
            onNavigate={handleNavigate}
          />
        ) : null}
        <CommandPaletteInitializer />
        <AppLayout
          bannerComponent={shellBanner}
          menuComponent={menuComponent}
          topbarComponent={topbarComponent}
          shellChromeVariant={shellChromeVariant}
          topbarChromeVariant={topbarChromeVariant}
          hasSecondaryTopbar={hasSecondaryTopbar}
          menuItems={menuItems}
          agentPanel={agentPanel}
          isAgentCollapsed={!isAgentOpen}
          onAgentToggle={toggleAgent}
        >
          {children}
        </AppLayout>
        <CommandPalette />
      </CommandPaletteProvider>
    </>
  );
}

interface AppProtectedLayoutProps extends LayoutProps {
  initialBootstrap?: ProtectedBootstrapData | null;
}

export default function AppProtectedLayout({
  children,
  initialBootstrap,
}: AppProtectedLayoutProps) {
  const rawPathname = usePathname();
  // Strip org/brand prefix for route detection
  const pathname = useMemo(() => {
    const parts = rawPathname.split('/').filter(Boolean);
    if (parts.length >= 3) {
      const knownPrefixes = [
        'workspace',
        'studio',
        'settings',
        'agents',
        'posts',
        'analytics',
        'workflows',
        'library',
        'chat',
        'compose',
        'editor',
        'research',
        'issues',
        'overview',
        'ingredients',
        'videos',
        'edit',
        'orchestration',
        'elements',
        'bots',
      ];
      if (parts[1] === '~' || knownPrefixes.includes(parts[2])) {
        const rest = parts[1] === '~' ? parts.slice(2) : parts.slice(2);
        return `/${rest.join('/')}`;
      }
    }
    return rawPathname;
  }, [rawPathname]);
  const isWorkspaceRoute =
    pathname === '/workspace' ||
    pathname === '/overview' ||
    pathname.startsWith('/workspace/');
  const isEditorCanvasRoute =
    pathname === '/editor/new' ||
    /^\/editor\/[^/]+$/.test(pathname) ||
    pathname === '/workflows/new' ||
    /^\/workflows\/[^/]+$/.test(pathname);

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
