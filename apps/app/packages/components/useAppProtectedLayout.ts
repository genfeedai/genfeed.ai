import { ADMIN_MENU_ITEMS } from '@app-config/admin-menu-items.config';
import { getAnalyticsMenuItemsForScope } from '@app-config/analytics-menu-items.config';
import { AUTOMATE_MENU_ITEMS } from '@app-config/automate-menu-items.config';
import { DISCOVER_MENU_ITEMS } from '@app-config/discover-menu-items.config';
import { LIBRARY_MENU_ITEMS } from '@app-config/library-menu-items.config';
import {
  APP_MENU_ITEMS,
  getAppSecondaryMenuItems,
  PUBLISH_INSERT_AFTER_LABEL,
} from '@app-config/menu-items.config';
import { getMessagesMenuItemsForScope } from '@app-config/messages-menu-items.config';
import { ORG_MENU_ITEMS } from '@app-config/org-menu-items.config';
import { PUBLISH_MENU_ITEMS } from '@app-config/publish-menu-items.config';
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
import { hasOrganizationBillingHint } from '@genfeedai/config/license';
import { APP_ROUTE_PREFIXES, APP_ROUTES } from '@genfeedai/constants';
import type { AppContext } from '@genfeedai/interfaces';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useUserRole } from '@hooks/auth/use-user-role';
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
  isFocusedOnboardingPath,
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
  const isFocusedOnboardingRoute = isFocusedOnboardingPath(pathname);
  const isDiscoverRoute =
    pathname === APP_ROUTES.DISCOVER.ROOT ||
    pathname.startsWith(`${APP_ROUTES.DISCOVER.ROOT}/`);
  const isLibraryLandingRoute = pathname === APP_ROUTES.LIBRARY.OVERVIEW;
  const isLibraryRoute = pathname.startsWith(APP_ROUTE_PREFIXES.LIBRARY);
  const isMessagesRoute = pathname.startsWith(APP_ROUTE_PREFIXES.MESSAGES);
  const isMessagesInboxRoute = pathname === APP_ROUTES.MESSAGES.ROOT;
  const isStudioRoute = pathname.startsWith(APP_ROUTE_PREFIXES.STUDIO);
  const isPublishRoute = pathname.startsWith(APP_ROUTE_PREFIXES.PUBLISH);
  // Dense studio canvases + mission-control runs: hide shell low-credits strip
  // so it does not steal vertical space under fixed chrome.
  const suppressShellLowCreditsBanner =
    /^\/studio\/(batch|clips|fastlane|storyboard)(?:\/|$)/.test(pathname) ||
    pathname === APP_ROUTES.AUTOMATE.WORKFLOWS_EXECUTIONS ||
    pathname === APP_ROUTES.AUTOMATE.RUNS;
  const isSettingsRoute = pathname.startsWith(APP_ROUTE_PREFIXES.SETTINGS);
  const isEditorCanvasRoute = isProtectedEditorCanvasRoute(pathname);
  const isMoodboardRoute = pathname === APP_ROUTES.LIBRARY.MOODBOARD;
  const isAutomateRoute = pathname.startsWith(APP_ROUTE_PREFIXES.AUTOMATE);
  const isAnalyticsRoute = pathname.startsWith(APP_ROUTE_PREFIXES.ANALYTICS);
  // Org shell only for true org destinations (overview, etc.). Module routes
  // under `/:org/~/publish|studio|…` keep their own app sidebars — otherwise
  // Publish steals the Organization menu.
  const isOrgRoute = (() => {
    const parts = rawPathname.split('/').filter(Boolean);
    return (
      parts[1] === '~' &&
      !pathname.startsWith(APP_ROUTE_PREFIXES.SETTINGS) &&
      !isConversationRoute &&
      !isPublishRoute &&
      !isAnalyticsRoute &&
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
        : isPublishRoute
          ? 'publish'
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
    insertAfterLabel: PUBLISH_INSERT_AFTER_LABEL,
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

  // Studio is production-only now — one-off generation moved to the Agent, so
  // no menu item maps to a generation category. Fastlane keeps its own org flag.
  const studioMenuItems = useMemo(
    () =>
      STUDIO_MENU_ITEMS.reduce<MenuItemConfig[]>((items, item) => {
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
      }, []),
    [isFastlaneEnabled, isFastlaneLoading, taskContextSearchParams],
  );

  const publishMenuItems = useMemo(
    () =>
      PUBLISH_MENU_ITEMS.map(
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

  const messagesMenuItems = useMemo(
    () =>
      getMessagesMenuItemsForScope(brandSlug).map(
        (item): MenuItemConfig => ({
          ...item,
          href: withTaskContextHref(item.href, taskContextSearchParams),
        }),
      ),
    [brandSlug, taskContextSearchParams],
  );

  const analyticsMenuItems = useMemo(
    () =>
      getAnalyticsMenuItemsForScope(brandSlug).map(
        (item): MenuItemConfig => ({
          ...item,
          href: withTaskContextHref(item.href, taskContextSearchParams),
        }),
      ),
    [brandSlug, taskContextSearchParams],
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
        isEnterprise: hasOrganizationBillingHint(),
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
    isConversationRoute,
    isEditorCanvasRoute,
    isFocusedOnboardingRoute,
    isLibraryLandingRoute,
    isLibraryRoute,
    isMessagesRoute,
    isMessagesInboxRoute,
    isMoodboardRoute,
    isOrgRoute,
    isPublishRoute,
    suppressShellLowCreditsBanner,
    isDiscoverRoute,
    isSettingsRoute,
    isStudioRoute,
    isAutomateRoute,
    isWorkspaceRoute,
    isUniversalWorkspaceShell,
    workspaceShellRoute,
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
    libraryMenuItems,
    menuItems,
    orgMenuItems,
    publishMenuItems,
    discoverMenuItems,
    secondaryMenuItems,
    settingsMenuItems,
    studioMenuItems,
    automateMenuItems,
    messagesMenuItems,
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
