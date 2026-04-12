'use client';

import StreakNotificationsBridge from '@app-components/streaks/StreakNotificationsBridge';
import {
  ADMIN_LOGO_HREF,
  ADMIN_MENU_ITEMS,
} from '@app-config/admin-menu-items.config';
import {
  ANALYTICS_LOGO_HREF,
  ANALYTICS_MENU_ITEMS,
} from '@app-config/analytics-menu-items.config';
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
import {
  WORKFLOWS_LOGO_HREF,
  WORKFLOWS_MENU_ITEMS,
} from '@app-config/workflows-menu-items.config';
import { CommandPaletteProvider } from '@contexts/features/command-palette.context';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  AGENT_PANEL_OPEN_KEY,
  AgentApiService,
  useAgentChatStore,
  useAgentPageContext,
} from '@genfeedai/agent';
import type { AppContext } from '@genfeedai/interfaces';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
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
import AdminSidebar from '@ui/shell/menus/AdminSidebar';
import AppSidebar from '@ui/shell/menus/AppSidebar';
import AdminTopbar from '@ui/shell/topbars/AdminTopbar';
import { COMPOSE_ROUTES } from '@ui-constants/compose.constant';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { HiPlus } from 'react-icons/hi2';
import AppProtectedTopbar from '@/components/shell/AppProtectedTopbar';
import { useOptionalAuth } from '@/hooks/useOptionalAuth';
import { isEEEnabled } from '@/lib/config/edition';
import {
  normalizeProtectedPathname,
  pickOperatorTaskContextSearchParams,
  withTaskContextHref,
} from '@/lib/navigation/operator-shell';
import { dispatchOpenTaskComposer } from '@/lib/workspace/task-composer-events';

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
  const searchParams = useSearchParams();
  // Strip org/brand prefix from pathname for route detection.
  // Pathname may be /orgSlug/brandSlug/studio or /orgSlug/~/settings.
  const pathname = useMemo(
    () => normalizeProtectedPathname(rawPathname),
    [rawPathname],
  );
  const isChatRoute = /^\/chat(?:\/|$)/.test(pathname);
  const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/');
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
  const hasSecondaryTopbar = !isAdminRoute && pathname.startsWith('/studio');
  const WORKFLOWS_NAMED_ROUTES = new Set([
    'executions',
    'autopilot',
    'configuration',
    'skills',
  ]);
  const isEditorCanvasRoute =
    pathname === '/editor/new' ||
    /^\/editor\/[^/]+$/.test(pathname) ||
    pathname === '/workflows/new' ||
    (/^\/workflows\/([^/]+)$/.test(pathname) &&
      !WORKFLOWS_NAMED_ROUTES.has(pathname.split('/')[2] ?? ''));
  const isWorkflowsRoute = pathname.startsWith('/workflows');
  const isEditorRoute = pathname.startsWith('/editor');
  const isAnalyticsRoute = pathname.startsWith('/analytics');

  const currentApp: AppContext = isStudioRoute
    ? 'studio'
    : isComposeRoute
      ? 'compose'
      : isWorkflowsRoute
        ? 'workflows'
        : isEditorRoute
          ? 'editor'
          : isAnalyticsRoute
            ? 'analytics'
            : 'workspace';

  const shouldMountAgentPanel = !isEditorCanvasRoute && !isChatRoute;
  const shouldInitAgentApiService = shouldMountAgentPanel || isChatRoute;

  const router = useRouter();
  const { getToken } = useOptionalAuth();
  const taskContextSearchParams = useMemo(
    () =>
      pickOperatorTaskContextSearchParams(
        new URLSearchParams(searchParams?.toString()),
      ),
    [searchParams],
  );
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
  const menuItems = useMemo(
    () =>
      dynamicMenuItems.map(
        (item): MenuItemConfig => ({
          ...item,
          href: withTaskContextHref(item.href, taskContextSearchParams),
        }),
      ),
    [dynamicMenuItems, taskContextSearchParams],
  );
  const secondaryMenuItems = useMemo(
    () =>
      getAppSecondaryMenuItems(brandId).map(
        (item): MenuItemConfig => ({
          ...item,
          href: withTaskContextHref(item.href, taskContextSearchParams),
        }),
      ),
    [brandId, taskContextSearchParams],
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

  const { href: buildHref, orgHref, orgSlug, brandSlug } = useOrgUrl();
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
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === 'n'
      ) {
        event.preventDefault();
        dispatchOpenTaskComposer();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
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
    }).map(
      (item): MenuItemConfig => ({
        ...item,
        href: withTaskContextHref(item.href, taskContextSearchParams),
      }),
    );
  }, [enabledCategories, isEnabledCategoriesLoading, taskContextSearchParams]);

  const composeMenuItems = useMemo(
    () =>
      COMPOSE_MENU_ITEMS.map(
        (item): MenuItemConfig => ({
          ...item,
          href: withTaskContextHref(item.href, taskContextSearchParams),
        }),
      ),
    [taskContextSearchParams],
  );

  const workflowsMenuItems = useMemo(
    () =>
      WORKFLOWS_MENU_ITEMS.map(
        (item): MenuItemConfig => ({
          ...item,
          href: withTaskContextHref(item.href, taskContextSearchParams),
        }),
      ),
    [taskContextSearchParams],
  );

  const analyticsMenuItems = useMemo(
    () =>
      ANALYTICS_MENU_ITEMS.map(
        (item): MenuItemConfig => ({
          ...item,
          href: withTaskContextHref(item.href, taskContextSearchParams),
        }),
      ),
    [taskContextSearchParams],
  );

  const orgMenuItems = useMemo(
    () =>
      ORG_MENU_ITEMS.map(
        (item): MenuItemConfig => ({
          ...item,
          href: withTaskContextHref(item.href, taskContextSearchParams),
        }),
      ),
    [taskContextSearchParams],
  );

  const settingsMenuItems = useMemo(
    () =>
      SETTINGS_MENU_ITEMS.map(
        (item): MenuItemConfig => ({
          ...item,
          href: withTaskContextHref(item.href, taskContextSearchParams),
        }),
      ),
    [taskContextSearchParams],
  );
  const adminMenuItems = useMemo(
    () =>
      ADMIN_MENU_ITEMS.map(
        (item): MenuItemConfig => ({
          ...item,
          href: withTaskContextHref(item.href, taskContextSearchParams),
        }),
      ),
    [taskContextSearchParams],
  );

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
          logoHref={withTaskContextHref(
            buildHref(STUDIO_LOGO_HREF),
            taskContextSearchParams,
          )}
          backHref={withTaskContextHref(
            buildHref('/library/ingredients'),
            taskContextSearchParams,
          )}
          backLabel="Library"
          sectionLabel="Studio"
          shellChromeVariant={shellChromeVariant}
        />
      );
    }

    if (isAdminRoute) {
      return (
        <AdminSidebar
          items={adminMenuItems}
          logoHref={withTaskContextHref(
            ADMIN_LOGO_HREF,
            taskContextSearchParams,
          )}
        />
      );
    }

    if (isComposeRoute) {
      return (
        <AppSidebar
          items={composeMenuItems}
          logoHref={withTaskContextHref(
            buildHref(COMPOSE_LOGO_HREF),
            taskContextSearchParams,
          )}
          backHref={withTaskContextHref(
            buildHref('/posts'),
            taskContextSearchParams,
          )}
          backLabel="Posts"
          sectionLabel="Compose"
          shellChromeVariant={shellChromeVariant}
        />
      );
    }

    if (isWorkflowsRoute) {
      return (
        <AppSidebar
          items={workflowsMenuItems}
          logoHref={withTaskContextHref(
            buildHref(WORKFLOWS_LOGO_HREF),
            taskContextSearchParams,
          )}
          backHref={withTaskContextHref(
            buildHref('/workspace/overview'),
            taskContextSearchParams,
          )}
          backLabel="Workspace"
          sectionLabel="Workflows"
          shellChromeVariant={shellChromeVariant}
        />
      );
    }

    if (isEditorRoute) {
      return (
        <AppSidebar
          items={[]}
          logoHref={withTaskContextHref(
            buildHref('/workspace/overview'),
            taskContextSearchParams,
          )}
          backHref={withTaskContextHref(
            buildHref('/workspace/overview'),
            taskContextSearchParams,
          )}
          backLabel="Workspace"
          sectionLabel="Editor"
          shellChromeVariant={shellChromeVariant}
        />
      );
    }

    if (isAnalyticsRoute) {
      return (
        <AppSidebar
          items={analyticsMenuItems}
          logoHref={withTaskContextHref(
            buildHref(ANALYTICS_LOGO_HREF),
            taskContextSearchParams,
          )}
          backHref={withTaskContextHref(
            buildHref('/workspace/overview'),
            taskContextSearchParams,
          )}
          backLabel="Workspace"
          sectionLabel="Analytics"
          shellChromeVariant={shellChromeVariant}
        />
      );
    }

    if (isOrgRoute) {
      return (
        <AppSidebar
          items={orgMenuItems}
          logoHref={withTaskContextHref(
            orgHref(ORG_LOGO_HREF),
            taskContextSearchParams,
          )}
          backHref={withTaskContextHref(
            buildHref('/workspace/overview'),
            taskContextSearchParams,
          )}
          backLabel="Workspace"
          sectionLabel="Organization"
          shellChromeVariant={shellChromeVariant}
        />
      );
    }

    if (isSettingsRoute) {
      return (
        <AppSidebar
          items={settingsMenuItems}
          logoHref={withTaskContextHref(
            buildHref(SETTINGS_LOGO_HREF),
            taskContextSearchParams,
          )}
          backHref={withTaskContextHref(
            buildHref('/workspace/overview'),
            taskContextSearchParams,
          )}
          backLabel="Workspace"
          sectionLabel="Settings"
          shellChromeVariant={shellChromeVariant}
        />
      );
    }

    return (
      <AppSidebar
        items={isChatRoute ? [] : menuItems}
        logoHref={withTaskContextHref(
          buildHref(APP_LOGO_HREF),
          taskContextSearchParams,
        )}
        sectionLabel={isChatRoute ? undefined : 'Workspace'}
        collapsedSidebarWidth={isChatRoute ? undefined : 64}
        mobileSidebarWidth={isChatRoute ? undefined : 304}
        primaryAction={
          isChatRoute
            ? undefined
            : {
                icon: <HiPlus className="h-4 w-4" />,
                label: 'New Task',
                onClick: dispatchOpenTaskComposer,
              }
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
        sidebarWidth={isChatRoute ? undefined : 304}
        shellChromeVariant={shellChromeVariant}
      />
    );
  }, [
    buildHref,
    orgHref,
    analyticsMenuItems,
    composeMenuItems,
    conversationActions,
    adminMenuItems,
    menuItems,
    isAdminRoute,
    isAnalyticsRoute,
    isComposeRoute,
    isEditorCanvasRoute,
    isEditorRoute,
    isOrgRoute,
    isSettingsRoute,
    isStudioRoute,
    isWorkflowsRoute,
    renderConversations,
    isFocusedOnboardingRoute,
    isChatRoute,
    orgMenuItems,
    shellChromeVariant,
    secondaryMenuItems,
    settingsMenuItems,
    studioMenuItems,
    taskContextSearchParams,
    workflowsMenuItems,
  ]);

  const topbarComponent =
    isEditorCanvasRoute || isFocusedOnboardingRoute
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
          onAgentToggle={toggleAgent}
          orgSlug={orgSlug}
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
        'tasks',
        'overview',
        'ingredients',
        'videos',
        'edit',
        'orchestration',
        'elements',
        'bots',
        'admin',
      ];
      if (
        parts[1] === '~' ||
        knownPrefixes.some((prefix) => prefix === parts[2])
      ) {
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
  const workflowsNamedRoutes = new Set([
    'executions',
    'autopilot',
    'configuration',
    'skills',
  ]);
  const isEditorCanvasRoute =
    pathname === '/editor/new' ||
    /^\/editor\/[^/]+$/.test(pathname) ||
    pathname === '/workflows/new' ||
    (/^\/workflows\/([^/]+)$/.test(pathname) &&
      !workflowsNamedRoutes.has(pathname.split('/')[2] ?? ''));

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
