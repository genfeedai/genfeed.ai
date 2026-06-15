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
import { SETTINGS_MENU_ITEMS } from '@app-config/settings-menu-items.config';
import { STUDIO_MENU_ITEMS } from '@app-config/studio-menu-items.config';
import { WORKFLOWS_MENU_ITEMS } from '@app-config/workflows-menu-items.config';
import {
  AGENT_PANEL_OPEN_KEY,
  AgentApiService,
  useAgentChatStore,
  useAgentPageContext,
} from '@genfeedai/agent';
import type { AppContext } from '@genfeedai/interfaces';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import { resolveClerkToken } from '@helpers/auth/clerk.helper';
import { useUserRole } from '@hooks/auth/use-user-role';
import {
  STUDIO_CATEGORY_CONFIG,
  useEnabledCategories,
} from '@hooks/data/organization/use-enabled-categories/use-enabled-categories';
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
import { COMPOSE_ROUTES } from '@ui-constants/compose.constant';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useOptionalAuth } from '@/hooks/useOptionalAuth';
import { isEEEnabled } from '@/lib/config/edition';
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

function isTerminalDockAvailable(): boolean {
  return (
    process.env.NEXT_PUBLIC_DESKTOP_SHELL === '1' ||
    process.env.NEXT_PUBLIC_GENFEED_CLOUD !== 'true'
  );
}

export function useAppProtectedLayout(
  initialBootstrap?: ProtectedBootstrapData | null,
) {
  const rawPathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();

  const pathname = useMemo(
    () => normalizeProtectedPathname(rawPathname),
    [rawPathname],
  );

  const isChatRoute = /^\/chat(?:\/|$)/.test(pathname);
  const isConversationRoute = isChatRoute;
  const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/');
  const isFocusedOnboardingRoute = pathname.startsWith('/chat/onboarding');
  const isComposeRoute = pathname.startsWith(COMPOSE_ROUTES.ROOT);
  const isLibraryLandingRoute = pathname === '/library/ingredients';
  const isLibraryRoute = pathname.startsWith('/library');
  const isStudioPromptBarRoute =
    pathname === '/studio' ||
    /^\/studio\/(avatar|image|music|video)(?:\/|$)/.test(pathname);
  const isStudioRoute = pathname.startsWith('/studio');
  const isPostsPromptBarRoute = pathname === '/posts';
  const isPostsRoute = pathname.startsWith('/posts');
  const isMissionControlPromptBarRoute =
    pathname === '/workflows/executions' || pathname === '/orchestration/runs';
  const isPromptBarRoute =
    isStudioPromptBarRoute ||
    isPostsPromptBarRoute ||
    isMissionControlPromptBarRoute;
  const isOrgRoute = (() => {
    const parts = rawPathname.split('/').filter(Boolean);
    return (
      parts[1] === '~' &&
      !pathname.startsWith('/settings') &&
      !isConversationRoute
    );
  })();
  const isSettingsRoute = pathname.startsWith('/settings');
  const hasSecondaryTopbar = !isAdminRoute && pathname.startsWith('/studio');
  const isEditorCanvasRoute =
    pathname === '/editor/new' ||
    /^\/editor\/[^/]+$/.test(pathname) ||
    pathname === '/workflows/new' ||
    (/^\/workflows\/([^/]+)$/.test(pathname) &&
      !WORKFLOWS_NAMED_ROUTES.has(pathname.split('/')[2] ?? ''));
  const isWorkflowsRoute =
    pathname.startsWith('/workflows') || pathname.startsWith('/orchestration');
  const isEditorRoute = pathname.startsWith('/editor');
  const isAnalyticsRoute = pathname.startsWith('/analytics');

  const currentApp: AppContext = isStudioRoute
    ? 'studio'
    : isLibraryRoute
      ? 'library'
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
                : isChatRoute
                  ? 'agent'
                  : 'workspace';

  const shouldMountAgentPanel =
    isTerminalDockAvailable() && !isEditorCanvasRoute && !isConversationRoute;
  const shouldInitAgentApiService =
    shouldMountAgentPanel || isConversationRoute;

  const { push, refresh } = useRouter();
  const { getToken, isSignedIn } = useOptionalAuth();
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

  // Sync route context into the agent store
  useAgentPageContext(role);

  const handleNavigateToBilling = useCallback(() => {
    push(orgHref(isEEEnabled() ? '/settings/billing' : '/settings/api-keys'));
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

  const isWorkspaceRoute =
    pathname === '/workspace' ||
    pathname === '/overview' ||
    pathname.startsWith('/workspace/');

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
    isOrgRoute,
    isPromptBarRoute,
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
