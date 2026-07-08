import { ADMIN_MENU_ITEMS } from '@app-config/admin-menu-items.config';
import { ANALYTICS_MENU_ITEMS } from '@app-config/analytics-menu-items.config';
import { COMPOSE_MENU_ITEMS } from '@app-config/compose-menu-items.config';
import { LIBRARY_MENU_ITEMS } from '@app-config/library-menu-items.config';
import {
  APP_MENU_ITEMS,
  getAppSecondaryMenuItems,
  POSTS_INSERT_AFTER_LABEL,
} from '@app-config/menu-items.config';
import { ORG_MENU_ITEMS } from '@app-config/org-menu-items.config';
import { RESEARCH_MENU_ITEMS } from '@app-config/research-menu-items.config';
import {
  buildSettingsMenuItems,
  type SettingsScope,
} from '@app-config/settings-menu-items.config';
import { STUDIO_MENU_ITEMS } from '@app-config/studio-menu-items.config';
import { WORKFLOWS_MENU_ITEMS } from '@app-config/workflows-menu-items.config';
import {
  AGENT_PANEL_OPEN_KEY,
  AgentApiService,
  useAgentChatStore,
  useAgentPageContext,
} from '@genfeedai/agent';
import {
  APP_ROUTE_PREFIXES,
  APP_ROUTES,
  COMPOSE_ROUTES,
} from '@genfeedai/constants';
import type { AppContext } from '@genfeedai/interfaces';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useUserRole } from '@hooks/auth/use-user-role';
import {
  STUDIO_CATEGORY_CONFIG,
  useEnabledCategories,
} from '@hooks/data/organization/use-enabled-categories/use-enabled-categories';
import { useFastlaneEnabled } from '@hooks/data/organization/use-fastlane-enabled/use-fastlane-enabled';
import { useFeatureFlag } from '@hooks/feature-flags/use-feature-flag';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useMenuItems } from '@hooks/ui/use-menu-items';
import type { ProtectedBootstrapData } from '@props/layout/protected-bootstrap.props';
import {
  dispatchAgentPanelStateChanged,
  ENTITY_OVERLAY_CLOSED_EVENT,
  ENTITY_OVERLAY_OPEN_AGENT_REQUESTED_EVENT,
  ENTITY_OVERLAY_OPENED_EVENT,
  type EntityOverlayVisibilityDetail,
  isDesktopAgentViewport,
} from '@services/core/agent-overlay-coordination.service';
import {
  useParams,
  usePathname,
  useRouter,
  useSearchParams,
} from 'next/navigation';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useOptionalAuth } from '@/hooks/useOptionalAuth';
import { isEEEnabled, isHostedCloudApp } from '@/lib/config/edition';
import {
  normalizeProtectedPathname,
  pickOperatorTaskContextSearchParams,
  withTaskContextHref,
} from '@/lib/navigation/operator-shell';
import { dispatchOpenTaskComposer } from '@/lib/workspace/task-composer-events';
import { useCommandPaletteStore } from '@/store/commandPaletteStore';

const WORKFLOWS_NAMED_ROUTES = new Set([
  'executions',
  'autopilot',
  'configuration',
  'skills',
]);

export function isProtectedEditorCanvasRoute(pathname: string): boolean {
  return (
    pathname === APP_ROUTES.EDITOR.NEW ||
    /^\/editor\/[^/]+$/.test(pathname) ||
    pathname === APP_ROUTES.WORKFLOWS.NEW ||
    (/^\/workflows\/([^/]+)$/.test(pathname) &&
      !WORKFLOWS_NAMED_ROUTES.has(pathname.split('/')[2] ?? ''))
  );
}

export function isProtectedWorkspaceRoute(pathname: string): boolean {
  return (
    pathname === APP_ROUTES.WORKSPACE.ROOT ||
    pathname === APP_ROUTES.OVERVIEW.ROOT ||
    pathname.startsWith(`${APP_ROUTE_PREFIXES.WORKSPACE}/`)
  );
}

function isTerminalDockAvailable(): boolean {
  return process.env.NEXT_PUBLIC_DESKTOP_SHELL === '1' || !isHostedCloudApp();
}

export function useAppProtectedLayout(
  initialBootstrap?: ProtectedBootstrapData | null,
) {
  const rawPathname = usePathname();
  const routeParams = useParams<{ brandSlug?: string; orgSlug?: string }>();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();

  const pathname = useMemo(
    () => normalizeProtectedPathname(rawPathname),
    [rawPathname],
  );

  const isAgentRoute = /^\/agent(?:\/|$)/.test(pathname);
  const isConversationRoute = isAgentRoute;
  const isAdminRoute =
    pathname === APP_ROUTES.ADMIN.ROOT ||
    pathname.startsWith(`${APP_ROUTE_PREFIXES.ADMIN}/`);
  const isFocusedOnboardingRoute = pathname.startsWith(
    APP_ROUTES.AGENT.ONBOARDING,
  );
  const isComposeRoute = pathname.startsWith(COMPOSE_ROUTES.ROOT);
  const isResearchRoute =
    pathname === APP_ROUTES.RESEARCH.ROOT ||
    pathname.startsWith(`${APP_ROUTES.RESEARCH.ROOT}/`);
  const isLibraryLandingRoute = pathname === APP_ROUTES.LIBRARY.INGREDIENTS;
  const isLibraryRoute = pathname.startsWith(APP_ROUTE_PREFIXES.LIBRARY);
  const isMessagesRoute = pathname.startsWith(APP_ROUTE_PREFIXES.MESSAGES);
  const isStudioPromptBarRoute =
    pathname === APP_ROUTES.STUDIO.ROOT ||
    /^\/studio\/(avatar|image|music|video)(?:\/|$)/.test(pathname);
  const isStudioRoute = pathname.startsWith(APP_ROUTE_PREFIXES.STUDIO);
  const isPostsPromptBarRoute = pathname === APP_ROUTES.POSTS.ROOT;
  const isRemixRoute = pathname.startsWith('/posts/remix');
  const isPostsRoute = pathname.startsWith(APP_ROUTE_PREFIXES.POSTS);
  const isMissionControlPromptBarRoute =
    pathname === APP_ROUTES.WORKFLOWS.EXECUTIONS ||
    pathname === APP_ROUTES.ORCHESTRATION.RUNS;
  const isPromptBarRoute =
    isStudioPromptBarRoute ||
    isPostsPromptBarRoute ||
    isMissionControlPromptBarRoute;
  const isOrgRoute = (() => {
    const parts = rawPathname.split('/').filter(Boolean);
    return (
      parts[1] === '~' &&
      !pathname.startsWith(APP_ROUTE_PREFIXES.SETTINGS) &&
      !isConversationRoute
    );
  })();
  const isSettingsRoute = pathname.startsWith(APP_ROUTE_PREFIXES.SETTINGS);
  const hasSecondaryTopbar =
    !isAdminRoute && pathname.startsWith(APP_ROUTE_PREFIXES.STUDIO);
  const isEditorCanvasRoute = isProtectedEditorCanvasRoute(pathname);
  const isMoodboardRoute = pathname === APP_ROUTES.LIBRARY.MOODBOARD;
  const isWorkflowsRoute =
    pathname.startsWith(APP_ROUTE_PREFIXES.WORKFLOWS) ||
    pathname.startsWith(APP_ROUTE_PREFIXES.ORCHESTRATION);
  const isEditorRoute = pathname.startsWith(APP_ROUTE_PREFIXES.EDITOR);
  const isAnalyticsRoute = pathname.startsWith(APP_ROUTE_PREFIXES.ANALYTICS);

  const currentApp: AppContext = isStudioRoute
    ? 'studio'
    : isLibraryRoute
      ? 'library'
      : isResearchRoute
        ? 'research'
        : isRemixRoute
          ? 'remix'
          : isPostsRoute
            ? 'posts'
            : isComposeRoute
              ? 'compose'
              : isWorkflowsRoute
                ? 'workflows'
                : isEditorRoute
                  ? 'editor'
                  : isAnalyticsRoute
                    ? 'analytics'
                    : isMessagesRoute
                      ? 'messages'
                      : isAgentRoute
                        ? 'agent'
                        : 'workspace';

  const shouldMountAgentPanel =
    isTerminalDockAvailable() &&
    !isEditorCanvasRoute &&
    !isMoodboardRoute &&
    !isConversationRoute;
  const shouldInitAgentApiService =
    shouldMountAgentPanel || isConversationRoute;

  const { push, refresh } = useRouter();
  const { getToken, isLoaded: isAuthLoaded, isSignedIn } = useOptionalAuth();
  const isAuthReadyForAgentPanel = isAuthLoaded && isSignedIn;
  const prevIsSignedInRef = useRef(false);
  useEffect(() => {
    if (isSignedIn && !prevIsSignedInRef.current) {
      refresh();
    }
    prevIsSignedInRef.current = isSignedIn ?? false;
  }, [isSignedIn, refresh]);

  const taskContextSearchParams = useMemo(
    () =>
      pickOperatorTaskContextSearchParams(
        new URLSearchParams(searchParamsString),
      ),
    [searchParamsString],
  );

  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const dynamicMenuItems = useMenuItems({
    insertAfterLabel: POSTS_INSERT_AFTER_LABEL,
    items: APP_MENU_ITEMS,
  });
  const { orgHref, orgSlug, brandSlug } = useOrgUrl();

  const agentApiService = useMemo(() => {
    if (!shouldInitAgentApiService) {
      return null;
    }

    return new AgentApiService({
      baseUrl: process.env.NEXT_PUBLIC_API_ENDPOINT ?? '',
      getToken: async (options) =>
        resolveAuthToken(getTokenRef.current, options),
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
      getAppSecondaryMenuItems(brandSlug).map(
        (item): MenuItemConfig => ({
          ...item,
          href: withTaskContextHref(item.href, taskContextSearchParams),
        }),
      ),
    [brandSlug, taskContextSearchParams],
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
  const { isEnabled: isFastlaneEnabled, isLoading: isFastlaneLoading } =
    useFastlaneEnabled();

  // Sync route context into the agent store
  useAgentPageContext(role);

  const handleNavigateToBilling = useCallback(() => {
    push(orgHref(isEEEnabled() ? '/settings/billing' : '/settings/credits'));
  }, [push, orgHref]);

  const handleNavigate = useCallback(
    (path: string) => {
      push(path);
    },
    [push],
  );

  const handleOpenCommandPalette = useCallback(() => {
    useCommandPaletteStore.getState().open();
  }, []);

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

    return STUDIO_MENU_ITEMS.reduce<MenuItemConfig[]>((items, item) => {
      if (!item.href) {
        items.push({
          ...item,
          href: withTaskContextHref(item.href, taskContextSearchParams),
        });
        return items;
      }

      const studioCategory = categoryByHref.get(item.href);

      if (!studioCategory) {
        // Fastlane is not a generation category — gate it on its own org flag.
        // Hide while the flag is still loading to avoid a flash of the item.
        if (
          item.href === APP_ROUTES.STUDIO.FASTLANE &&
          (!isFastlaneEnabled || isFastlaneLoading)
        ) {
          return items;
        }

        items.push({
          ...item,
          href: withTaskContextHref(item.href, taskContextSearchParams),
        });
        return items;
      }

      if (
        enabledCategories.includes(studioCategory.category) &&
        (!isEnabledCategoriesLoading || studioCategory.settingKey === null)
      ) {
        items.push({
          ...item,
          href: withTaskContextHref(item.href, taskContextSearchParams),
        });
      }

      return items;
    }, []);
  }, [
    enabledCategories,
    isEnabledCategoriesLoading,
    isFastlaneEnabled,
    isFastlaneLoading,
    taskContextSearchParams,
  ]);

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

  const libraryMenuItems = useMemo(
    () =>
      LIBRARY_MENU_ITEMS.map(
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

  const researchMenuItems = useMemo(
    () =>
      RESEARCH_MENU_ITEMS.map(
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

  // The settings sidebar is scope-specific: brand route → brand pages, org
  // route → org pages, otherwise personal pages. Scope is derived from the route
  // params (brandSlug/orgSlug), not selected-brand context.
  const settingsScope: SettingsScope = routeParams.brandSlug
    ? 'brand'
    : routeParams.orgSlug
      ? 'organization'
      : 'personal';

  const settingsMenuItems = useMemo(
    () =>
      buildSettingsMenuItems({
        scope: settingsScope,
        isEnterprise: isEEEnabled(),
      }).map(
        (item): MenuItemConfig => ({
          ...item,
          href: withTaskContextHref(item.href, taskContextSearchParams),
        }),
      ),
    [settingsScope, taskContextSearchParams],
  );

  const adminMenuItems = useMemo(
    () =>
      ADMIN_MENU_ITEMS.map(
        (item): MenuItemConfig => ({
          ...item,
          hrefScope: 'global',
          href: withTaskContextHref(item.href, taskContextSearchParams),
        }),
      ),
    [taskContextSearchParams],
  );

  const isWorkspaceRoute = isProtectedWorkspaceRoute(pathname);

  const isLowCreditsBannerEnabled = useFeatureFlag('low_credits_banner');
  const isDesktopShell = process.env.NEXT_PUBLIC_DESKTOP_SHELL === '1';

  return {
    // route flags
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
    isWorkspaceRoute,
    hasSecondaryTopbar,
    // app/org
    currentApp,
    orgSlug,
    brandSlug,
    // agent
    agentApiService,
    isAuthReadyForAgentPanel,
    isAgentOpen,
    toggleAgent,
    threads,
    shouldMountAgentPanel,
    // menu items
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
    // task context
    taskContextSearchParams,
    // conversation
    conversationActions,
    setConversationActions,
    // handlers
    handleNavigate,
    handleNavigateToBilling,
    handleOpenCommandPalette,
    // banners
    isLowCreditsBannerEnabled,
    isDesktopShell,
    // bootstrap passthrough
    initialBootstrap,
  };
}
