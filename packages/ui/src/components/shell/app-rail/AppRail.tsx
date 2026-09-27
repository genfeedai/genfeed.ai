'use client';

import {
  APP_DISPLAY_LABELS,
  APP_ROUTES,
  APP_SWITCHER_FEATURE_FLAGS,
  type AppSwitcherFeatureFlagKey,
  createBrandAppRoute,
  createOrganizationAppRoute,
} from '@genfeedai/contracts/constants';
import type { AppRailItemConfig } from '@genfeedai/contracts/interfaces';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useFeatureFlag } from '@genfeedai/hooks/feature-flags/use-feature-flag';
import type {
  AppRailBadge,
  AppRailNavigationTarget,
  AppRailProps,
} from '@genfeedai/props/ui/app-rail.props';
import { useNavigationIntentPrefetch } from '@ui/navigation/prefetch/useNavigationPrefetch';
import {
  ChartNoAxesColumn,
  Layers,
  LayoutGrid,
  Lock,
  MessageSquare,
  Send,
  ShieldCheck,
  Sparkles,
  Terminal,
  TrendingUp,
  Workflow,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { Separator } from '../../../primitives/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../../primitives/tooltip';

type RailAppConfig = AppRailItemConfig & {
  /**
   * Product path roots that activate this app (menu-style). Matched against the
   * brand/org-stripped pathname, e.g. `/studio`, `/publishing`, `/automation`.
   * Longest root wins; no match → nothing highlighted (settings, onboarding, …).
   */
  activePathRoots: readonly string[];
  description: string;
  visibilityFlagKey?: AppSwitcherFeatureFlagKey;
};

function createScopedAppRoute({
  brandPath,
  organizationPath = brandPath,
}: {
  brandPath: string;
  organizationPath?: string;
}): RailAppConfig['route'] {
  return (org, brand) =>
    brand
      ? createBrandAppRoute(org, brand, brandPath)
      : createOrganizationAppRoute(org, organizationPath);
}

/**
 * Two groups, top to bottom. The first is the daily loop — ask the agent,
 * triage the workspace, create, pick assets, ship, reply. The second holds the
 * research, measurement and automation surfaces visited less often.
 */
const RAIL_APP_GROUPS: readonly (readonly RailAppConfig[])[] = [
  [
    {
      activePathRoots: ['/agent'],
      description: 'Ask and execute.',
      icon: Terminal,
      id: 'agent',
      label: APP_DISPLAY_LABELS.agent,
      route: createScopedAppRoute({ brandPath: '/agent' }),
      visibilityFlagKey: APP_SWITCHER_FEATURE_FLAGS.agent,
    },
    {
      activePathRoots: ['/workspace', '/overview'],
      description: 'Command center.',
      icon: LayoutGrid,
      id: 'workspace',
      label: APP_DISPLAY_LABELS.workspace,
      route: createScopedAppRoute({ brandPath: '/workspace/overview' }),
      visibilityFlagKey: APP_SWITCHER_FEATURE_FLAGS.workspace,
    },
    {
      activePathRoots: ['/studio'],
      description: 'Create assets.',
      icon: Sparkles,
      id: 'studio',
      label: APP_DISPLAY_LABELS.studio,
      // Studio production tools require a brand. The org route hands one-off
      // generation to Agent while preserving a stable rail destination.
      route: createScopedAppRoute({
        brandPath: '/studio/generate',
        organizationPath: '/studio',
      }),
      visibilityFlagKey: APP_SWITCHER_FEATURE_FLAGS.studio,
    },
    {
      activePathRoots: ['/library'],
      description: 'Use source assets.',
      icon: Layers,
      id: 'library',
      label: APP_DISPLAY_LABELS.library,
      route: createScopedAppRoute({ brandPath: '/library/assets' }),
      visibilityFlagKey: APP_SWITCHER_FEATURE_FLAGS.library,
    },
    {
      activePathRoots: ['/publishing'],
      description: 'Drafts and posts.',
      icon: Send,
      id: 'publishing',
      label: APP_DISPLAY_LABELS.publishing,
      route: createScopedAppRoute({ brandPath: '/publishing/overview' }),
      visibilityFlagKey: APP_SWITCHER_FEATURE_FLAGS.publishing,
    },
    {
      activePathRoots: ['/messages'],
      description: 'Reply to audience.',
      icon: MessageSquare,
      id: 'messages',
      label: APP_DISPLAY_LABELS.messages,
      route: createScopedAppRoute({ brandPath: '/messages' }),
      visibilityFlagKey: APP_SWITCHER_FEATURE_FLAGS.messages,
    },
  ],
  [
    {
      activePathRoots: ['/discovery'],
      description: 'Find winners.',
      icon: TrendingUp,
      id: 'discovery',
      label: APP_DISPLAY_LABELS.discovery,
      route: createScopedAppRoute({ brandPath: '/discovery/overview' }),
      visibilityFlagKey: APP_SWITCHER_FEATURE_FLAGS.discovery,
    },
    {
      activePathRoots: ['/analytics'],
      description: 'Measure results.',
      icon: ChartNoAxesColumn,
      id: 'analytics',
      label: APP_DISPLAY_LABELS.analytics,
      route: createScopedAppRoute({ brandPath: '/analytics/overview' }),
      visibilityFlagKey: APP_SWITCHER_FEATURE_FLAGS.analytics,
    },
    {
      activePathRoots: ['/automation'],
      description: 'Run workflows.',
      icon: Workflow,
      id: 'automation',
      label: APP_DISPLAY_LABELS.automation,
      route: createScopedAppRoute({ brandPath: '/automation/overview' }),
      visibilityFlagKey: APP_SWITCHER_FEATURE_FLAGS.automation,
    },
  ],
];

const ADMIN_RAIL_APP: RailAppConfig = {
  activePathRoots: ['/admin'],
  description: 'Platform management.',
  icon: ShieldCheck,
  id: 'admin',
  label: APP_DISPLAY_LABELS.admin,
  route: () => APP_ROUTES.ADMIN.OVERVIEW.DASHBOARD,
};

function withPreservedSearch(path: string, preservedSearch?: string): string {
  if (!preservedSearch) {
    return path;
  }

  const normalizedSearch = preservedSearch.startsWith('?')
    ? preservedSearch.slice(1)
    : preservedSearch;

  if (!normalizedSearch) {
    return path;
  }

  const [pathname, existingSearch = ''] = path.split('?', 2);
  const mergedSearchParams = new URLSearchParams(existingSearch);
  const preservedSearchParams = new URLSearchParams(normalizedSearch);

  for (const [key, value] of preservedSearchParams.entries()) {
    mergedSearchParams.set(key, value);
  }

  const nextSearch = mergedSearchParams.toString();

  return nextSearch ? `${pathname}?${nextSearch}` : pathname;
}

function useRailVisibility(): Record<AppSwitcherFeatureFlagKey, boolean> {
  return {
    [APP_SWITCHER_FEATURE_FLAGS.workspace]: useFeatureFlag(
      APP_SWITCHER_FEATURE_FLAGS.workspace,
    ),
    [APP_SWITCHER_FEATURE_FLAGS.agent]: useFeatureFlag(
      APP_SWITCHER_FEATURE_FLAGS.agent,
    ),
    [APP_SWITCHER_FEATURE_FLAGS.messages]: useFeatureFlag(
      APP_SWITCHER_FEATURE_FLAGS.messages,
    ),
    [APP_SWITCHER_FEATURE_FLAGS.discovery]: useFeatureFlag(
      APP_SWITCHER_FEATURE_FLAGS.discovery,
    ),
    [APP_SWITCHER_FEATURE_FLAGS.studio]: useFeatureFlag(
      APP_SWITCHER_FEATURE_FLAGS.studio,
    ),
    [APP_SWITCHER_FEATURE_FLAGS.library]: useFeatureFlag(
      APP_SWITCHER_FEATURE_FLAGS.library,
    ),
    [APP_SWITCHER_FEATURE_FLAGS.publishing]: useFeatureFlag(
      APP_SWITCHER_FEATURE_FLAGS.publishing,
    ),
    [APP_SWITCHER_FEATURE_FLAGS.analytics]: useFeatureFlag(
      APP_SWITCHER_FEATURE_FLAGS.analytics,
    ),
    [APP_SWITCHER_FEATURE_FLAGS.automation]: useFeatureFlag(
      APP_SWITCHER_FEATURE_FLAGS.automation,
    ),
  };
}

function normalizePath(path?: string): string | undefined {
  if (!path) {
    return undefined;
  }

  const [pathname] = path.split('?', 1);
  const normalizedPathname = pathname.replace(/\/+$/, '');

  return normalizedPathname || '/';
}

/**
 * Strip tenant scope so matching is product-root based, like sidebar menus:
 * `/acme/default/studio/storyboard` → `/studio/storyboard`
 * `/acme/~/settings/brands` → `/settings/brands`
 * `/admin/users` → `/admin/users`
 */
function extractProductPath(pathname: string): string {
  const normalized = normalizePath(pathname);
  if (!normalized) {
    return '/';
  }

  const parts = normalized.split('/').filter(Boolean);
  if (parts.length === 0) {
    return '/';
  }

  // Global / personal (no org prefix)
  if (
    parts[0] === 'admin' ||
    parts[0] === 'settings' ||
    parts[0] === 'connect' ||
    parts[0] === 'login' ||
    parts[0] === 'sign-up' ||
    parts[0] === 'onboarding'
  ) {
    return `/${parts.join('/')}`;
  }

  // `/:orgSlug/~/:rest*` or `/:orgSlug/:brandSlug/:rest*`
  if (parts.length >= 2) {
    const rest = parts.slice(2);
    return rest.length > 0 ? `/${rest.join('/')}` : '/';
  }

  return `/${parts.join('/')}`;
}

function scoreActivePathRoot(productPath: string, root: string): number {
  const normalizedRoot = normalizePath(root);
  if (!normalizedRoot) {
    return 0;
  }

  if (productPath === normalizedRoot) {
    return normalizedRoot.length + 1000;
  }

  if (productPath.startsWith(`${normalizedRoot}/`)) {
    return normalizedRoot.length;
  }

  return 0;
}

/**
 * Highlight like a menu item: the app whose product root owns the current path.
 * No fallback to a default app — settings / unknown surfaces stay unselected.
 */
function getActiveAppId({
  apps,
  currentPath,
}: {
  apps: readonly RailAppConfig[];
  currentPath?: string;
}): string | undefined {
  const productPath = extractProductPath(currentPath ?? '');
  if (!productPath || productPath === '/') {
    return undefined;
  }

  let activeAppId: string | undefined;
  let activeScore = 0;

  for (const app of apps) {
    for (const root of app.activePathRoots) {
      const score = scoreActivePathRoot(productPath, root);
      if (score > activeScore) {
        activeAppId = app.id;
        activeScore = score;
      }
    }
  }

  return activeAppId;
}

function AppRailItem({
  app,
  badge,
  href,
  isActive,
  isLocked,
  navigationAnnouncement,
  onNavigateStart,
}: {
  app: RailAppConfig;
  badge?: AppRailBadge;
  href: string;
  isActive: boolean;
  isLocked: boolean;
  navigationAnnouncement?: string;
  onNavigateStart: (announcement?: string) => void;
}) {
  const Icon = app.icon;
  const intent = useNavigationIntentPrefetch(href);
  const hasBadge = !isLocked && badge !== undefined && badge.count > 0;
  const accessibleLabel = isLocked
    ? `${app.label} — locked. Generate your first asset to unlock.`
    : hasBadge
      ? `${app.label}, ${badge.label}`
      : app.label;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={href}
          prefetch={false}
          aria-current={isActive ? 'page' : undefined}
          aria-describedby={`app-rail-desc-${app.id}`}
          aria-label={accessibleLabel}
          data-testid={`app-rail-item-${app.id}`}
          onBlur={intent.onBlur}
          onClick={() => onNavigateStart(navigationAnnouncement)}
          onFocus={intent.onFocus}
          onMouseEnter={intent.onMouseEnter}
          onMouseLeave={intent.onMouseLeave}
          className={cn(
            'relative inline-flex size-9 shrink-0 items-center justify-center rounded-md transition-[background-color,color] duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            isActive
              ? 'bg-foreground/[0.1] text-foreground'
              : 'text-foreground/58 hover:bg-foreground/[0.06] hover:text-foreground',
            isLocked && 'opacity-60',
          )}
        >
          <Icon aria-hidden="true" className="size-[1.125rem]" />
          {isLocked ? (
            <span className="absolute -right-0.5 -top-0.5 inline-flex size-4 items-center justify-center rounded-full bg-background text-foreground/70 shadow-border">
              <Lock aria-hidden="true" className="size-2.5" />
            </span>
          ) : hasBadge ? (
            <span
              aria-hidden="true"
              data-testid={`app-rail-badge-${app.id}`}
              className="absolute -right-1 -top-1 rounded-full bg-info px-1 text-2xs tabular-nums text-info-foreground"
            >
              {badge.count > 99 ? '99+' : badge.count}
            </span>
          ) : null}
          <span id={`app-rail-desc-${app.id}`} className="sr-only">
            {app.description}
          </span>
        </Link>
      </TooltipTrigger>
      <TooltipContent
        side="right"
        sideOffset={10}
        collisionPadding={12}
        className="max-w-60 py-2"
      >
        <span className="block font-semibold">{app.label}</span>
        <span className="mt-0.5 block font-normal text-muted-foreground">
          {app.description}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Persistent top-level navigation (Codex / Slack two-level pattern): the rail
 * picks the app, the sidebar next to it holds that app's own menu.
 */
export function AppRail({
  badges,
  brandAwareSlug,
  brandSlug,
  currentPath,
  isAssetGateLocked = false,
  onNavigate,
  orgSlug,
  preservedSearch,
  resolveNavigation,
  showAdmin = false,
}: AppRailProps) {
  const railVisibility = useRailVisibility();
  const [navigationAnnouncement, setNavigationAnnouncement] = useState('');

  const groups = useMemo(
    () =>
      RAIL_APP_GROUPS.map((group) =>
        group.filter(
          (app) =>
            !app.visibilityFlagKey || railVisibility[app.visibilityFlagKey],
        ),
      ).filter((group) => group.length > 0),
    [railVisibility],
  );
  const apps = useMemo(() => {
    const productApps = groups.flat();
    return showAdmin ? [...productApps, ADMIN_RAIL_APP] : productApps;
  }, [groups, showAdmin]);
  const activeAppId = getActiveAppId({ apps, currentPath });

  function getRouteBrandSlug(app: RailAppConfig) {
    // Agent and Studio both resolve to the session-selected brand when the
    // current route is org-scoped, so an operator with a brand selected but
    // no brand in the URL still lands on that brand's surface (#4671)
    // instead of the org fallback.
    if (app.id === 'agent' || app.id === 'studio') {
      return brandSlug ?? brandAwareSlug;
    }

    return brandSlug;
  }

  function getAppHref(app: RailAppConfig) {
    return withPreservedSearch(
      app.route(orgSlug, getRouteBrandSlug(app)),
      preservedSearch,
    );
  }

  // First-asset unlock gate: the rail entries for these gated sections render
  // locked and route to the agent (Workflows/Calendar have no rail entry — the
  // page-level guard covers them).
  function isAppLocked(app: RailAppConfig): boolean {
    return (
      isAssetGateLocked &&
      (app.id === 'workspace' || app.id === 'library' || app.id === 'analytics')
    );
  }

  function resolveAppHref(app: RailAppConfig): string {
    if (!isAppLocked(app)) {
      return getAppHref(app);
    }

    const agentApp = apps.find((candidate) => candidate.id === 'agent');
    if (!agentApp) {
      return getAppHref(app);
    }

    const agentHref = getAppHref(agentApp);
    const separator = agentHref.includes('?') ? '&' : '?';
    return `${agentHref}${separator}locked=${encodeURIComponent(app.id)}`;
  }

  function resolveAppNavigation(app: RailAppConfig): AppRailNavigationTarget {
    const href = resolveAppHref(app);

    return resolveNavigation?.(href) ?? { href };
  }

  const handleNavigateStart = (announcement?: string) => {
    setNavigationAnnouncement(announcement ?? 'Opening app.');
    onNavigate?.();
  };

  function renderItem(app: RailAppConfig) {
    const navigation = resolveAppNavigation(app);

    return (
      <AppRailItem
        key={app.id}
        app={app}
        badge={badges?.[app.id]}
        href={navigation.href}
        isActive={app.id === activeAppId}
        isLocked={isAppLocked(app)}
        navigationAnnouncement={navigation.announcement}
        onNavigateStart={handleNavigateStart}
      />
    );
  }

  return (
    <TooltipProvider delayDuration={300} skipDelayDuration={200}>
      <nav
        aria-label="Apps"
        className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto px-2 pb-2 pt-1.5"
        data-testid="app-rail"
      >
        {groups.map((group, index) => (
          <div
            key={group[0]?.id ?? index}
            className="flex flex-col items-center gap-1"
          >
            {index > 0 ? (
              <Separator className="mb-1 w-5" data-testid="app-rail-divider" />
            ) : null}
            {group.map(renderItem)}
          </div>
        ))}
        {showAdmin ? (
          <div className="mt-auto flex flex-col items-center pt-2">
            {renderItem(ADMIN_RAIL_APP)}
          </div>
        ) : null}
      </nav>
      <span aria-live="polite" className="sr-only" role="status">
        {navigationAnnouncement}
      </span>
    </TooltipProvider>
  );
}

export default AppRail;
