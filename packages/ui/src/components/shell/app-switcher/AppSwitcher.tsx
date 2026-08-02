'use client';

import {
  APP_SWITCHER_FEATURE_FLAGS,
  type AppSwitcherFeatureFlagKey,
  createBrandAppRoute,
  createOrganizationAppRoute,
} from '@genfeedai/constants';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useFeatureFlag } from '@genfeedai/hooks/feature-flags/use-feature-flag';
import type { AppSwitcherItemConfig } from '@genfeedai/interfaces';
import type {
  AppSwitcherNavigationTarget,
  AppSwitcherProps,
} from '@genfeedai/props/ui/app-switcher.props';
import {
  Briefcase,
  ChartNoAxesColumn,
  ChevronDown,
  Grip,
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
import { useMemo, useRef, useState } from 'react';

import { Button } from '../../../primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../primitives/dropdown-menu';

type LifecycleAppSwitcherItemConfig = AppSwitcherItemConfig & {
  /**
   * Product path roots that activate this app (menu-style). Matched against the
   * brand/org-stripped pathname, e.g. `/studio`, `/posts`, `/orchestration`.
   * Longest root wins; no match → nothing highlighted (settings, onboarding, …).
   */
  activePathRoots: readonly string[];
  description: string;
  itemKey: string;
  visibilityFlagKey?: AppSwitcherFeatureFlagKey;
};

type AppSwitcherSectionConfig = {
  id: string;
  label: string;
  apps: LifecycleAppSwitcherItemConfig[];
};

function createScopedAppRoute({
  brandPath,
  organizationPath = brandPath,
}: {
  brandPath: string;
  organizationPath?: string;
}): LifecycleAppSwitcherItemConfig['route'] {
  return (org, brand) =>
    brand
      ? createBrandAppRoute(org, brand, brandPath)
      : createOrganizationAppRoute(org, organizationPath);
}

/**
 * Flat ordered launcher (no section chrome). Order encodes product flow:
 * Operate tools → Create assets → Trends → Publish (+ compose/editor) → Analytics.
 */
const APP_SWITCHER_SECTIONS: AppSwitcherSectionConfig[] = [
  {
    id: 'apps',
    label: 'Apps',
    apps: [
      {
        activePathRoots: ['/workspace', '/overview'],
        description: 'Command center.',
        icon: LayoutGrid,
        id: 'workspace',
        itemKey: 'workspace',
        label: 'Workspace',
        route: createScopedAppRoute({
          brandPath: '/workspace',
          organizationPath: '/overview',
        }),
        visibilityFlagKey: APP_SWITCHER_FEATURE_FLAGS.workspace,
      },
      {
        activePathRoots: ['/agent'],
        description: 'Ask and execute.',
        icon: Terminal,
        id: 'agent',
        itemKey: 'agent',
        label: 'Agent',
        route: createScopedAppRoute({ brandPath: '/agent' }),
        visibilityFlagKey: APP_SWITCHER_FEATURE_FLAGS.agent,
      },
      {
        activePathRoots: ['/messages'],
        description: 'Reply to audience.',
        icon: MessageSquare,
        id: 'messages',
        itemKey: 'messages',
        label: 'Messages',
        route: createScopedAppRoute({ brandPath: '/messages' }),
        visibilityFlagKey: APP_SWITCHER_FEATURE_FLAGS.messages,
      },
      {
        activePathRoots: ['/orchestration'],
        description: 'Workflows, autopilot, and team ops.',
        icon: Workflow,
        id: 'automate',
        itemKey: 'automate',
        label: 'Automate',
        route: createScopedAppRoute({
          brandPath: '/orchestration',
        }),
        visibilityFlagKey: APP_SWITCHER_FEATURE_FLAGS.automate,
      },
      {
        activePathRoots: ['/studio'],
        description: 'Produce storyboards, clips, and batches.',
        icon: LayoutGrid,
        id: 'studio',
        itemKey: 'studio',
        label: 'Studio',
        // Studio is brand-scoped production tooling; without a brand the org
        // route hands off to the Agent, which owns one-off generation.
        route: createScopedAppRoute({
          brandPath: '/studio/storyboard',
          organizationPath: '/studio',
        }),
        visibilityFlagKey: APP_SWITCHER_FEATURE_FLAGS.studio,
      },
      {
        activePathRoots: ['/library'],
        description: 'Use source assets.',
        icon: Layers,
        id: 'library',
        itemKey: 'library',
        label: 'Library',
        route: createScopedAppRoute({
          brandPath: '/library',
          organizationPath: '/library',
        }),
        visibilityFlagKey: APP_SWITCHER_FEATURE_FLAGS.library,
      },
      {
        activePathRoots: ['/research'],
        description: 'Find winners.',
        icon: TrendingUp,
        id: 'research',
        itemKey: 'trends',
        label: 'Trends',
        route: createScopedAppRoute({ brandPath: '/research/discovery' }),
        visibilityFlagKey: APP_SWITCHER_FEATURE_FLAGS.research,
      },
      {
        // Compose + Editor are publish-adjacent create surfaces, not Studio.
        activePathRoots: ['/posts', '/compose', '/editor'],
        description: 'Drafts, posts, compose, and editor.',
        icon: Send,
        id: 'posts',
        itemKey: 'publish',
        label: 'Publish',
        route: createScopedAppRoute({ brandPath: '/posts' }),
        visibilityFlagKey: APP_SWITCHER_FEATURE_FLAGS.posts,
      },
      {
        activePathRoots: ['/analytics'],
        description: 'Measure results.',
        icon: ChartNoAxesColumn,
        id: 'analytics',
        itemKey: 'analytics',
        label: 'Analytics',
        route: createScopedAppRoute({ brandPath: '/analytics' }),
        visibilityFlagKey: APP_SWITCHER_FEATURE_FLAGS.analytics,
      },
    ],
  },
];

const ADMIN_APP_SWITCHER_SECTION: AppSwitcherSectionConfig = {
  id: 'admin',
  label: 'Administration',
  apps: [
    {
      activePathRoots: ['/admin'],
      description: 'Platform management.',
      icon: ShieldCheck,
      id: 'admin',
      itemKey: 'admin',
      label: 'Admin',
      route: () => '/admin',
    },
  ],
};

/** Optional icon overrides for a few tiles in the flat grid. */
const APP_SWITCHER_ICON_OVERRIDES: Partial<
  Record<string, LifecycleAppSwitcherItemConfig['icon']>
> = {
  automate: Workflow,
  library: Briefcase,
  studio: Sparkles,
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

function humanizeSlug(value?: string): string {
  if (!value) {
    return 'Default Workspace';
  }

  return value
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function useAppSwitcherVisibility(): Record<
  AppSwitcherFeatureFlagKey,
  boolean
> {
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
    [APP_SWITCHER_FEATURE_FLAGS.research]: useFeatureFlag(
      APP_SWITCHER_FEATURE_FLAGS.research,
    ),
    [APP_SWITCHER_FEATURE_FLAGS.studio]: useFeatureFlag(
      APP_SWITCHER_FEATURE_FLAGS.studio,
    ),
    [APP_SWITCHER_FEATURE_FLAGS.library]: useFeatureFlag(
      APP_SWITCHER_FEATURE_FLAGS.library,
    ),
    [APP_SWITCHER_FEATURE_FLAGS.posts]: useFeatureFlag(
      APP_SWITCHER_FEATURE_FLAGS.posts,
    ),
    [APP_SWITCHER_FEATURE_FLAGS.analytics]: useFeatureFlag(
      APP_SWITCHER_FEATURE_FLAGS.analytics,
    ),
    [APP_SWITCHER_FEATURE_FLAGS.automate]: useFeatureFlag(
      APP_SWITCHER_FEATURE_FLAGS.automate,
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
function getActiveItemKey({
  apps,
  currentPath,
}: {
  apps: LifecycleAppSwitcherItemConfig[];
  currentPath?: string;
}): string | undefined {
  const productPath = extractProductPath(currentPath ?? '');
  if (!productPath || productPath === '/') {
    return undefined;
  }

  let activeItemKey: string | undefined;
  let activeScore = 0;

  for (const app of apps) {
    for (const root of app.activePathRoots) {
      const score = scoreActivePathRoot(productPath, root);
      if (score > activeScore) {
        activeItemKey = app.itemKey;
        activeScore = score;
      }
    }
  }

  return activeItemKey;
}

function AppSwitcherGridItem({
  app,
  isActive,
  isLocked = false,
  href,
  navigationAnnouncement,
  onNavigateStart,
}: {
  app: LifecycleAppSwitcherItemConfig;
  isActive: boolean;
  isLocked?: boolean;
  href: string;
  navigationAnnouncement?: string;
  onNavigateStart: (announcement?: string) => void;
}) {
  const Icon = APP_SWITCHER_ICON_OVERRIDES[app.itemKey] ?? app.icon;

  return (
    <DropdownMenuItem asChild>
      <Link
        href={href}
        aria-current={isActive ? 'page' : undefined}
        aria-label={
          isLocked
            ? `${app.label} — locked. Generate your first asset to unlock.`
            : undefined
        }
        onClick={() => onNavigateStart(navigationAnnouncement)}
        className={cn(
          'group grid min-h-[4.5rem] min-w-0 grid-rows-[2.25rem_1.125rem] place-items-center gap-1 rounded-lg px-1 py-1.5 text-center outline-none',
          'border-transparent !bg-transparent !shadow-none !ring-0 !ring-offset-0',
          'focus:text-inherit data-[highlighted]:text-inherit',
        )}
      >
        <span
          className={cn(
            'relative inline-flex size-9 items-center justify-center rounded-lg bg-background-secondary text-foreground/58 transition-colors',
            isActive
              ? 'bg-foreground text-background'
              : 'group-hover:bg-foreground group-hover:text-background group-focus-visible:bg-foreground group-focus-visible:text-background',
            isLocked && 'opacity-60',
          )}
        >
          <Icon aria-hidden="true" className="size-[1.125rem]" />
          {isLocked ? (
            <span className="absolute -right-1 -top-1 inline-flex size-4 items-center justify-center rounded-full bg-background text-foreground/70 shadow-border">
              <Lock aria-hidden="true" className="size-2.5" />
            </span>
          ) : null}
        </span>
        <span
          className={cn(
            'block whitespace-nowrap text-xs font-semibold leading-[1.125rem]',
            isActive
              ? 'text-foreground'
              : 'text-foreground/58 group-hover:text-foreground group-focus-visible:text-foreground',
            // No label underline — active state is the filled icon tile only.
            isLocked && 'text-foreground/45',
          )}
        >
          {app.label}
        </span>
      </Link>
    </DropdownMenuItem>
  );
}

export function AppSwitcher({
  brandAwareSlug,
  brandSlug,
  currentPath,
  isAssetGateLocked = false,
  orgSlug,
  preservedSearch,
  resolveNavigation,
  showAdmin = false,
  variant = 'icon',
}: AppSwitcherProps) {
  const appSwitcherVisibility = useAppSwitcherVisibility();
  const preventTriggerAutoFocusRef = useRef(false);
  const [navigationAnnouncement, setNavigationAnnouncement] = useState('');

  function getRouteBrandSlug(app: AppSwitcherItemConfig) {
    if (app.id === 'agent') {
      return brandSlug ?? brandAwareSlug;
    }

    return brandSlug;
  }

  function getAppHref(app: AppSwitcherItemConfig) {
    return withPreservedSearch(
      app.route(orgSlug, getRouteBrandSlug(app)),
      preservedSearch,
    );
  }

  // First-asset unlock gate: the app-switcher entries for these gated sections
  // render locked and route to the agent (Workflows/Calendar have no switcher
  // entry — the page-level guard covers them).
  function isAppLocked(app: AppSwitcherItemConfig): boolean {
    return (
      isAssetGateLocked &&
      (app.id === 'workspace' || app.id === 'library' || app.id === 'analytics')
    );
  }

  function resolveAppHref(app: AppSwitcherItemConfig): string {
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

  function resolveAppNavigation(
    app: AppSwitcherItemConfig,
  ): AppSwitcherNavigationTarget {
    const href = resolveAppHref(app);

    return resolveNavigation?.(href) ?? { href };
  }

  const handleNavigateStart = (announcement?: string) => {
    preventTriggerAutoFocusRef.current = true;
    setNavigationAnnouncement(announcement ?? 'Opening app.');
  };

  const sections = useMemo(() => {
    const availableSections = APP_SWITCHER_SECTIONS.map((section) => ({
      ...section,
      apps: section.apps.filter(
        (app) =>
          !app.visibilityFlagKey ||
          appSwitcherVisibility[app.visibilityFlagKey],
      ),
    })).filter((section) => section.apps.length > 0);

    return showAdmin
      ? [...availableSections, ADMIN_APP_SWITCHER_SECTION]
      : availableSections;
  }, [appSwitcherVisibility, showAdmin]);
  const apps = useMemo(
    () => sections.flatMap((section) => section.apps),
    [sections],
  );
  const activeItemKey = getActiveItemKey({
    apps,
    currentPath,
  });
  const activeApp = apps.find((app) => app.itemKey === activeItemKey);
  const ActiveIcon = activeApp?.icon ?? LayoutGrid;
  const activeLabel = activeApp?.label ?? 'Apps';
  const tenantLabel = humanizeSlug(brandSlug || orgSlug);

  // Flat grid of every flag-visible app (curation list removed — no dual
  // primary/secondary list that diverged from what actually rendered).
  if (apps.length === 0) {
    return null;
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        {variant === 'labeled' ? (
          <Button
            type="button"
            variant={ButtonVariant.GHOST}
            className="flex h-7 items-center gap-2 rounded-md px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            ariaLabel="Switch app"
          >
            <ActiveIcon className="size-4 shrink-0 text-foreground/70" />
            <span className="max-w-[12rem] truncate text-[13px] font-semibold text-foreground">
              {activeLabel}
            </span>
            <ChevronDown className="size-3.5 shrink-0 text-foreground/45" />
          </Button>
        ) : (
          <Button
            type="button"
            variant={ButtonVariant.GHOST}
            size={ButtonSize.ICON}
            className="size-7 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            ariaLabel="Switch app"
          >
            <Grip className="size-4" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="max-h-[min(80vh,30rem)] w-[calc(100vw-2rem)] overflow-y-auto p-0 sm:w-[19rem]"
        onCloseAutoFocus={(event) => {
          if (!preventTriggerAutoFocusRef.current) {
            return;
          }

          event.preventDefault();
          preventTriggerAutoFocusRef.current = false;
        }}
      >
        <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-3 py-2">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-foreground/52">
            Apps
          </div>
          <div className="min-w-0 truncate text-[13px] font-semibold text-foreground/58">
            {tenantLabel}
          </div>
        </div>

        <div
          className="grid grid-cols-3 gap-1 px-2.5 py-2.5"
          role="group"
          aria-label="Apps"
        >
          {apps.map((app) => {
            const navigation = resolveAppNavigation(app);

            return (
              <AppSwitcherGridItem
                key={app.itemKey}
                app={app}
                isActive={app.itemKey === activeItemKey}
                isLocked={isAppLocked(app)}
                href={navigation.href}
                navigationAnnouncement={navigation.announcement}
                onNavigateStart={handleNavigateStart}
              />
            );
          })}
        </div>

        <div className="sr-only" aria-live="polite">
          {activeApp ? (
            <>
              Current app:
              <span className="truncate">{activeLabel}</span>
            </>
          ) : null}
        </div>
      </DropdownMenuContent>
      <span aria-live="polite" className="sr-only" role="status">
        {navigationAnnouncement}
      </span>
    </DropdownMenu>
  );
}

export default AppSwitcher;
