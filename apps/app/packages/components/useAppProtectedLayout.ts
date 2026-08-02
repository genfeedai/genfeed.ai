import { ADMIN_MENU_ITEMS } from '@app-config/admin-menu-items.config';
import { ANALYTICS_MENU_ITEMS } from '@app-config/analytics-menu-items.config';
import { AUTOMATE_MENU_ITEMS } from '@app-config/automate-menu-items.config';
import { COMPOSE_MENU_ITEMS } from '@app-config/compose-menu-items.config';
import { DISCOVER_MENU_ITEMS } from '@app-config/discover-menu-items.config';
import { LIBRARY_MENU_ITEMS } from '@app-config/library-menu-items.config';
import {
  APP_MENU_ITEMS,
  getAppSecondaryMenuItems,
  POSTS_INSERT_AFTER_LABEL,
} from '@app-config/menu-items.config';
import { ORG_MENU_ITEMS } from '@app-config/org-menu-items.config';
import { POSTS_MENU_ITEMS } from '@app-config/posts-menu-items.config';
import {
  buildSettingsMenuItems,
  type SettingsScope,
} from '@app-config/settings-menu-items.config';
import { STUDIO_MENU_ITEMS } from '@app-config/studio-menu-items.config';
import {
  AgentApiService,
  useAgentChatStore,
  useAgentPageContext,
} from '@genfeedai/agent';
import { isDesktopClient } from '@genfeedai/config/deployment';
import { hasOrganizationBilling } from '@genfeedai/config/license';
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
  useParams,
  usePathname,
  useRouter,
  useSearchParams,
} from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useOptionalAuth } from '@/hooks/useOptionalAuth';
import {
  normalizeProtectedPathname,
  pickOperatorTaskContextSearchParams,
  withTaskContextHref,
} from '@/lib/navigation/operator-shell';
import { dispatchOpenTaskComposer } from '@/lib/workspace/task-composer-events';
import { resolveWorkspaceShellRoute } from '@/lib/workspace-shell/workspace-shell-registry';
import { useCommandPaletteStore } from '@/store/commandPaletteStore';

const AUTOMATE_WORKFLOW_RESERVED = new Set(['executions', 'new', 'templates']);

export function isProtectedEditorCanvasRoute(pathname: string): boolean {
  return (
    pathname === APP_ROUTES.STUDIO.EDIT_NEW ||
    /^\/studio\/edit\/[^/]+$/.test(pathname) ||
    pathname === APP_ROUTES.AUTOMATE.WORKFLOWS_NEW ||
    (/^\/automate\/workflows\/([^/]+)$/.test(pathname) &&
      !AUTOMATE_WORKFLOW_RESERVED.has(pathname.split('/')[3] ?? ''))
  );
}

export function isProtectedWorkspaceRoute(pathname: string): boolean {
  return (
    pathname === APP_ROUTES.WORKSPACE.ROOT ||
    pathname === APP_ROUTES.OVERVIEW.ROOT ||
    pathname.startsWith(`${APP_ROUTE_PREFIXES.WORKSPACE}/`)
  );
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
  const isDiscoverRoute =
    pathname === APP_ROUTES.DISCOVER.ROOT ||
    pathname.startsWith(`${APP_ROUTES.DISCOVER.ROOT}/`);
  const isLibraryLandingRoute = pathname === APP_ROUTES.LIBRARY.OVERVIEW;
  const isLibraryRoute = pathname.startsWith(APP_ROUTE_PREFIXES.LIBRARY);
  const isMessagesRoute = pathname.startsWith(APP_ROUTE_PREFIXES.MESSAGES);
  const isStudioPromptBarRoute =
    pathname === APP_ROUTES.STUDIO.ROOT ||
    /^\/studio\/(avatar|image|music|video)(?:\/|$)/.test(pathname);
  const isStudioRoute = pathname.startsWith(APP_ROUTE_PREFIXES.STUDIO);
  const isPostsPromptBarRoute = pathname === APP_ROUTES.POSTS.ROOT;
  const isPostsRoute = pathname.startsWith(APP_ROUTE_PREFIXES.POSTS);
  const isMissionControlPromptBarRoute =
    pathname === APP_ROUTES.AUTOMATE.WORKFLOWS_EXECUTIONS ||
    pathname === APP_ROUTES.AUTOMATE.RUNS;
  const isPromptBarRoute =
    isStudioPromptBarRoute ||
    isPostsPromptBarRoute ||
    isMissionControlPromptBarRoute;
  const isSettingsRoute = pathname.startsWith(APP_ROUTE_PREFIXES.SETTINGS);
  const hasSecondaryTopbar =
    !isAdminRoute && pathname.startsWith(APP_ROUTE_PREFIXES.STUDIO);
  const isEditorCanvasRoute = isProtectedEditorCanvasRoute(pathname);
  const isMoodboardRoute = pathname === APP_ROUTES.LIBRARY.MOODBOARD;
  const isAutomateRoute = pathname.startsWith(APP_ROUTE_PREFIXES.AUTOMATE);
  const isAnalyticsRoute = pathname.startsWith(APP_ROUTE_PREFIXES.ANALYTICS);
  // Org shell only for true org destinations (overview, etc.). Module routes
  // under `/:org/~/posts|studio|…` keep their own app sidebars — otherwise
  // Publish/posts steals the Organization menu.
  const isOrgRoute = (() => {
    const parts = rawPathname.split('/').filter(Boolean);
    return (
      parts[1] === '~' &&
      !pathname.startsWith(APP_ROUTE_PREFIXES.SETTINGS) &&
      !isConversationRoute &&
      !isPostsRoute &&
      !isAnalyticsRoute &&
      !isComposeRoute &&
      !isStudioRoute &&
      !isLibraryRoute &&
      !isDiscoverRoute &&
      !isAutomateRoute &&
      !isMessagesRoute
    );
  })();
  const workspaceShellRoute = useMemo(
    () => resolveWorkspaceShellRoute(rawPathname),
    [rawPathname],
  );
  const isUniversalWorkspaceShell =
    Boolean(workspaceShellRoute) && !isAdminRoute;

  const currentApp: AppContext = isStudioRoute
    ? 'studio'
    : isLibraryRoute
      ? 'library'
      : isDiscoverRoute
        ? 'discover'
        : isPostsRoute
          ? 'posts'
          : isComposeRoute
            ? 'compose'
            : isAutomateRoute
              ? 'automate'
              : isAnalyticsRoute
                ? 'analytics'
                : isMessagesRoute
                  ? 'messages'
                  : isAgentRoute
                    ? 'agent'
                    : 'workspace';

  const shouldInitAgentApiService =
    isConversationRoute || isUniversalWorkspaceShell;

  const { push, refresh } = useRouter();
  const { getToken, isLoaded: isAuthLoaded, isSignedIn } = useOptionalAuth();
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
  const { orgSlug, brandSlug } = useOrgUrl();

  const agentApiService = useMemo(() => {
    if (!shouldInitAgentApiService || !isAuthLoaded || !isSignedIn) {
      return null;
    }

    return new AgentApiService({
      baseUrl: process.env.NEXT_PUBLIC_API_ENDPOINT ?? '',
      getToken: async (options) =>
        resolveAuthToken(getTokenRef.current, options),
    });
  }, [isAuthLoaded, isSignedIn, shouldInitAgentApiService]);

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

  const agentMenuItems = useMemo<MenuItemConfig[]>(
    () => [
      {
        group: '',
        href: withTaskContextHref(
          APP_ROUTES.AGENT.ROOT,
          taskContextSearchParams,
        ),
        label:
          pathname === APP_ROUTES.AGENT.ROOT ||
          pathname === APP_ROUTES.AGENT.NEW
            ? 'New conversation'
            : 'Conversation',
        matchPaths: [APP_ROUTES.AGENT.ROOT],
      },
    ],
    [pathname, taskContextSearchParams],
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

  const threads = useAgentChatStore((s) => s.threads);

  const role = useUserRole();
  const { enabledCategories, isLoading: isEnabledCategoriesLoading } =
    useEnabledCategories();
  const { isEnabled: isFastlaneEnabled, isLoading: isFastlaneLoading } =
    useFastlaneEnabled();

  // Sync route context into the agent store
  useAgentPageContext(role);

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

  const postsMenuItems = useMemo(
    () =>
      POSTS_MENU_ITEMS.map(
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

  const automateMenuItems = useMemo(
    () =>
      AUTOMATE_MENU_ITEMS.map(
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

  const discoverMenuItems = useMemo(
    () =>
      DISCOVER_MENU_ITEMS.map(
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
        isEnterprise: hasOrganizationBilling(),
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
  const isDesktopShell = isDesktopClient();

  return {
    // route flags
    isAdminRoute,
    isAnalyticsRoute,
    isComposeRoute,
    isConversationRoute,
    isEditorCanvasRoute,
    isFocusedOnboardingRoute,
    isLibraryLandingRoute,
    isLibraryRoute,
    isMessagesRoute,
    isMoodboardRoute,
    isOrgRoute,
    isPostsRoute,
    isPromptBarRoute,
    isDiscoverRoute,
    isSettingsRoute,
    isStudioRoute,
    isAutomateRoute,
    isWorkspaceRoute,
    isUniversalWorkspaceShell,
    workspaceShellRoute,
    hasSecondaryTopbar,
    // app/org
    currentApp,
    orgSlug,
    brandSlug,
    settingsScope,
    // agent
    agentApiService,
    threads,
    // menu items
    agentMenuItems,
    adminMenuItems,
    analyticsMenuItems,
    composeMenuItems,
    libraryMenuItems,
    menuItems,
    orgMenuItems,
    postsMenuItems,
    discoverMenuItems,
    secondaryMenuItems,
    settingsMenuItems,
    studioMenuItems,
    automateMenuItems,
    // task context
    taskContextSearchParams,
    // handlers
    handleNavigate,
    handleOpenCommandPalette,
    // banners
    isLowCreditsBannerEnabled,
    isDesktopShell,
    // bootstrap passthrough
    initialBootstrap,
  };
}
