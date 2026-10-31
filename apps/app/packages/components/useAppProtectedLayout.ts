import {
  ADMIN_MENU_ITEMS,
  withCollapsibleAdminGroups,
} from '@app-config/admin-menu-items.config';
import { getAnalyticsMenuItemsForScope } from '@app-config/analytics-menu-items.config';
import { AUTOMATION_MENU_ITEMS } from '@app-config/automation-menu-items.config';
import { DISCOVERY_MENU_ITEMS } from '@app-config/discovery-menu-items.config';
import { LIBRARY_MENU_ITEMS } from '@app-config/library-menu-items.config';
import {
  APP_MENU_ITEMS,
  getAppSecondaryMenuItems,
  PUBLISHING_INSERT_AFTER_LABEL,
} from '@app-config/menu-items.config';
import { MESSAGES_MENU_ITEMS } from '@app-config/messages-menu-items.config';
import { ORG_MENU_ITEMS } from '@app-config/org-menu-items.config';
import { PUBLISHING_MENU_ITEMS } from '@app-config/publishing-menu-items.config';
import {
  buildSettingsMenuItems,
  type SettingsScope,
} from '@app-config/settings-menu-items.config';
import {
  getStudioAppForPath,
  STUDIO_APP_MENU_ITEMS,
} from '@app-config/studio-menu-items.config';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  AgentApiService,
  useAgentChatStore,
  useAgentPageContext,
} from '@genfeedai/agent';
import { isDesktopClient } from '@genfeedai/config/deployment';
import {
  hasOrganizationBillingHint,
  shouldShowCreditsNav,
} from '@genfeedai/config/license';
import {
  APP_ROUTE_PREFIXES,
  APP_ROUTES,
  isReleaseItemId,
  isReleaseItemVisible,
  resolveOrganizationModulePreferences,
} from '@genfeedai/contracts/constants';
import type { AppContext } from '@genfeedai/contracts/interfaces';
import type { MenuItemConfig } from '@genfeedai/contracts/interfaces/ui/menu-config.interface';
import { useRouteParams } from '@genfeedai/hooks/navigation/use-route-params';
import { getDesktopCreditsVisibility } from '@genfeedai/services/core/desktop-runtime.service';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { ProtectedBootstrapData } from '@props/layout/protected-bootstrap.props';
import { CalendarClock, History, Images, MessagesSquare } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ADMIN_RAIL_CATEGORIES,
  getActiveAppId,
  isAppRailPathEnabled,
} from '@/components/shell/app-rail/app-rail.registry';
import { useUserRole } from '@/hooks/auth/use-user-role';
import { useFeatureFlagContext } from '@/hooks/feature-flags/provider';
import { useFeatureFlag } from '@/hooks/feature-flags/use-feature-flag';
import { useDesktopRuntimeContext } from '@/hooks/ui/use-desktop-runtime-context/use-desktop-runtime-context';
import { useMenuItems } from '@/hooks/ui/use-menu-items';
import { useOptionalAuth } from '@/hooks/useOptionalAuth';
import {
  normalizeProtectedPathname,
  pickOperatorTaskContextSearchParams,
  withTaskContextHref,
} from '@/lib/navigation/operator-shell';
import { resolveWorkspaceShellRoute } from '@/lib/workspace-shell/workspace-shell-registry';

import {
  isPersonalSettingsPage as computeIsPersonalSettingsPage,
  resolveSettingsScope,
} from './app-protected-layout.settings-scope';
import { usePageHelp } from './use-page-help';
import { useOpenTaskComposer } from './useOpenTaskComposer';

const AUTOMATION_WORKFLOW_RESERVED = new Set([
  'executions',
  'new',
  'templates',
]);

export function isProtectedEditorCanvasRoute(pathname: string): boolean {
  return (
    pathname === APP_ROUTES.STUDIO.EDITOR_NEW ||
    /^\/editor\/[^/]+$/.test(pathname) ||
    pathname === APP_ROUTES.AUTOMATION.WORKFLOWS_NEW ||
    (/^\/automation\/workflows\/([^/]+)$/.test(pathname) &&
      !AUTOMATION_WORKFLOW_RESERVED.has(pathname.split('/')[3] ?? ''))
  );
}

export function isProtectedWorkspaceRoute(pathname: string): boolean {
  return (
    pathname === APP_ROUTES.WORKSPACE.ROOT ||
    pathname === APP_ROUTES.WORKSPACE.OVERVIEW ||
    pathname.startsWith(`${APP_ROUTE_PREFIXES.WORKSPACE}/`)
  );
}

export function useAppProtectedLayout(
  initialBootstrap?: ProtectedBootstrapData | null,
) {
  const runtime = useDesktopRuntimeContext();
  const isSubscriptionAvailable =
    runtime.status === 'web' ||
    (runtime.status === 'ready' && runtime.context?.runtimeMode === 'cloud');
  const showCredits = shouldShowCreditsNav(
    getDesktopCreditsVisibility(runtime),
  );
  const rawPathname = usePathname();
  const routeParams = useRouteParams<{
    brandSlug?: string;
    orgSlug?: string;
  }>();
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
  const isDiscoveryRoute =
    pathname === APP_ROUTES.DISCOVERY.ROOT ||
    pathname.startsWith(`${APP_ROUTES.DISCOVERY.ROOT}/`);
  const isLibraryLandingRoute = pathname === APP_ROUTES.LIBRARY.ASSETS;
  const isLibraryRoute = pathname.startsWith(APP_ROUTE_PREFIXES.LIBRARY);
  const isMessagesRoute = pathname.startsWith(APP_ROUTE_PREFIXES.MESSAGES);
  const isMessagesInboxRoute = pathname === APP_ROUTES.MESSAGES.ROOT;
  // Studio tools are separate apps: `/<tool>` belongs to that tool.
  const studioApp = getStudioAppForPath(pathname);
  const isStudioRoute = studioApp !== undefined;
  const isPublishingRoute = pathname.startsWith(APP_ROUTE_PREFIXES.PUBLISHING);
  // Dense studio canvases + mission-control runs: hide shell low-credits strip
  // so it does not steal vertical space under fixed chrome.
  const suppressShellLowCreditsBanner =
    /^\/(clipper|storyboard)(?:\/|$)/.test(pathname) ||
    pathname === APP_ROUTES.AUTOMATION.RUNS;
  const isSettingsRoute = pathname.startsWith(APP_ROUTE_PREFIXES.SETTINGS);
  const isEditorCanvasRoute = isProtectedEditorCanvasRoute(pathname);
  const isAutomationRoute = pathname.startsWith(APP_ROUTE_PREFIXES.AUTOMATION);
  const isAnalyticsRoute = pathname.startsWith(APP_ROUTE_PREFIXES.ANALYTICS);
  // Org shell only for leftover org destinations (Connect, etc.). Module
  // routes under `/:org/~/workspace|publishing|turbo|…` keep their own app
  // sidebars — otherwise Workspace/Publishing steal the Organization menu.
  const isOrgRoute = (() => {
    const parts = rawPathname.split('/').filter(Boolean);
    return (
      parts[1] === '~' &&
      !pathname.startsWith(APP_ROUTE_PREFIXES.SETTINGS) &&
      !pathname.startsWith(APP_ROUTE_PREFIXES.WORKSPACE) &&
      !pathname.startsWith(APP_ROUTE_PREFIXES.OVERVIEW) &&
      !isConversationRoute &&
      !isPublishingRoute &&
      !isAnalyticsRoute &&
      !isStudioRoute &&
      !isLibraryRoute &&
      !isDiscoveryRoute &&
      !isAutomationRoute &&
      !isMessagesRoute
    );
  })();
  const workspaceShellRoute = useMemo(
    () => resolveWorkspaceShellRoute(rawPathname),
    [rawPathname],
  );
  const isUniversalWorkspaceShell =
    Boolean(workspaceShellRoute) && !isAdminRoute;

  const currentApp: AppContext = studioApp
    ? studioApp
    : isLibraryRoute
      ? 'library'
      : isDiscoveryRoute
        ? 'discovery'
        : isPublishingRoute
          ? 'publishing'
          : isAutomationRoute
            ? 'automation'
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
  const openTaskComposer = useOpenTaskComposer();
  const { getToken, isLoaded: isAuthLoaded, isSignedIn } = useOptionalAuth();
  // Refresh server components only on a real sign-in: a loaded signed-out
  // session that becomes signed in. The server already rendered this route with
  // the session cookie, so auth resolving on a cold load must not refetch it.
  const prevIsSignedInRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (!isAuthLoaded) {
      return;
    }
    const signedIn = isSignedIn ?? false;
    if (signedIn && prevIsSignedInRef.current === false) {
      refresh();
    }
    prevIsSignedInRef.current = signedIn;
  }, [isAuthLoaded, isSignedIn, refresh]);

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
    insertAfterLabel: PUBLISHING_INSERT_AFTER_LABEL,
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

  // The agent scope: the master conversation, then where its work lands.
  const agentMenuItems = useMemo<MenuItemConfig[]>(
    () =>
      [
        {
          group: '',
          href: APP_ROUTES.AGENT.ROOT,
          label:
            pathname === APP_ROUTES.AGENT.NEW ? 'New conversation' : 'Master',
          matchPaths: [APP_ROUTES.AGENT.ROOT],
          outline: MessagesSquare,
          solid: MessagesSquare,
        },
        {
          group: '',
          href: APP_ROUTES.AUTOMATION.RUNS,
          label: 'Runs',
          matchPaths: [APP_ROUTES.AUTOMATION.RUNS],
          outline: History,
          solid: History,
        },
        {
          group: '',
          href: APP_ROUTES.LIBRARY.OVERVIEW,
          label: 'Outputs',
          matchPaths: [APP_ROUTES.LIBRARY.OVERVIEW],
          outline: Images,
          solid: Images,
        },
        {
          group: '',
          href: APP_ROUTES.PUBLISHING.CALENDAR,
          label: 'Scheduled',
          matchPaths: [APP_ROUTES.PUBLISHING.CALENDAR],
          outline: CalendarClock,
          solid: CalendarClock,
        },
      ].map(
        (item): MenuItemConfig => ({
          ...item,
          href: withTaskContextHref(item.href, taskContextSearchParams),
        }),
      ),
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

  const contextRole = useUserRole();
  const bootstrapRole = initialBootstrap?.accessState?.memberRole;
  const role = bootstrapRole !== undefined ? bootstrapRole : contextRole;

  // Sync route context (and route help copy) into the agent store
  const pageHelp = usePageHelp(rawPathname);
  useAgentPageContext(role ?? undefined, pageHelp);

  const handleNavigate = useCallback(
    (path: string) => {
      push(path);
    },
    [push],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === 'n'
      ) {
        event.preventDefault();
        openTaskComposer();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openTaskComposer]);

  // Studio surfaces an operator switched off in Admin → Flags drop out of the
  // nav; idea batches enforce their own flag inside Batch.
  const { flags: platformFlags } = useFeatureFlagContext();
  const { settings: organizationSettings, settingsLoading } = useBrand();
  const modulePreferences = useMemo(
    () =>
      resolveOrganizationModulePreferences(
        settingsLoading ? null : organizationSettings,
        platformFlags,
      ),
    [organizationSettings, platformFlags, settingsLoading],
  );
  // Unreleased destinations stay hidden until the organization is known.
  const isReleased = useCallback(
    (item: MenuItemConfig) =>
      !item.releaseItemId ||
      isReleaseItemVisible(
        item.releaseItemId,
        settingsLoading ? null : organizationSettings,
        platformFlags,
      ),
    [organizationSettings, platformFlags, settingsLoading],
  );
  const studioMenuItems = useMemo(
    () =>
      (studioApp ? STUDIO_APP_MENU_ITEMS[studioApp] : [])
        .filter(
          (item) =>
            isAppRailPathEnabled(item.href, platformFlags) &&
            (!item.organizationModule ||
              // While preferences load, keep the always-released apps
              // (Playground, Storyboard) so their nav does not flicker.
              (modulePreferences?.[item.organizationModule] ??
                !isReleaseItemId(item.organizationModule))),
        )
        .map(
          (item): MenuItemConfig => ({
            ...item,
            href: withTaskContextHref(item.href, taskContextSearchParams),
          }),
        ),
    [platformFlags, taskContextSearchParams, modulePreferences, studioApp],
  );

  const publishingMenuItems = useMemo(
    () =>
      PUBLISHING_MENU_ITEMS.filter(isReleased).map(
        (item): MenuItemConfig => ({
          ...item,
          href: withTaskContextHref(item.href, taskContextSearchParams),
        }),
      ),
    [isReleased, taskContextSearchParams],
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

  const automationMenuItems = useMemo(
    () =>
      AUTOMATION_MENU_ITEMS.map(
        (item): MenuItemConfig => ({
          ...item,
          href: withTaskContextHref(item.href, taskContextSearchParams),
        }),
      ),
    [taskContextSearchParams],
  );

  const analyticsMenuItems = useMemo(
    () =>
      getAnalyticsMenuItemsForScope(brandSlug)
        .filter(isReleased)
        .map(
          (item): MenuItemConfig => ({
            ...item,
            href: withTaskContextHref(item.href, taskContextSearchParams),
          }),
        ),
    [brandSlug, isReleased, taskContextSearchParams],
  );

  const discoveryMenuItems = useMemo(
    () =>
      DISCOVERY_MENU_ITEMS.map(
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
  const settingsScope: SettingsScope = resolveSettingsScope(routeParams);
  // Personal-account settings PAGE (Personal/Notifications/Progress/Help/
  // About), flat or as an org-scoped copy — distinct from `settingsScope`
  // above, which stays ORGANIZATION for the org-scoped copy on purpose (it
  // drives the sidebar menu, not switcher visibility). See the helper's doc.
  const isPersonalSettingsPage = computeIsPersonalSettingsPage(rawPathname);

  const settingsMenuItems = useMemo(
    () =>
      buildSettingsMenuItems({
        scope: settingsScope,
        showCredits,
        isEnterprise: hasOrganizationBillingHint(),
      })
        .filter(
          (item) =>
            isSubscriptionAvailable ||
            item.href !== APP_ROUTES.SETTINGS.SUBSCRIPTION,
        )
        .map(
          (item): MenuItemConfig => ({
            ...item,
            href: withTaskContextHref(item.href, taskContextSearchParams),
          }),
        ),
    [
      isSubscriptionAvailable,
      settingsScope,
      showCredits,
      taskContextSearchParams,
    ],
  );

  // The rail picks the admin category; the sidebar lists only its pages.
  const adminCategoryId = getActiveAppId(ADMIN_RAIL_CATEGORIES, pathname);
  const adminMenuItems = useMemo(
    () =>
      withCollapsibleAdminGroups(
        ADMIN_MENU_ITEMS.filter(
          (item) => !adminCategoryId || item.category === adminCategoryId,
        ),
      ).map(
        ({ category: _category, ...item }): MenuItemConfig => ({
          ...item,
          hrefScope: 'global',
          href: withTaskContextHref(item.href, taskContextSearchParams),
        }),
      ),
    [adminCategoryId, taskContextSearchParams],
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
    isLibraryLandingRoute,
    isLibraryRoute,
    isMessagesRoute,
    isMessagesInboxRoute,
    isOrgRoute,
    isPublishingRoute,
    suppressShellLowCreditsBanner,
    isDiscoveryRoute,
    isSettingsRoute,
    isStudioRoute,
    isAutomationRoute,
    isWorkspaceRoute,
    isUniversalWorkspaceShell,
    workspaceShellRoute,
    // app/org
    currentApp,
    orgSlug,
    brandSlug,
    settingsScope,
    isPersonalSettingsPage,
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
    publishingMenuItems,
    discoveryMenuItems,
    secondaryMenuItems,
    settingsMenuItems,
    studioMenuItems,
    automationMenuItems,
    messagesMenuItems: MESSAGES_MENU_ITEMS,
    // handlers
    handleNavigate,
    // banners
    isLowCreditsBannerEnabled,
    isDesktopShell,
    // bootstrap passthrough
    initialBootstrap,
  };
}
