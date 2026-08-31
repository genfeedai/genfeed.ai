'use client';

import {
  APP_DISPLAY_LABELS,
  APP_ROUTES,
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
  ChevronsUpDown,
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
   * brand/org-stripped pathname, e.g. `/studio`, `/publishing`, `/automation`.
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
 * Operate tools → Create assets → Trends → Publishing → Analytics.
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
        label: APP_DISPLAY_LABELS.workspace,
        route: createScopedAppRoute({
          brandPath: '/workspace',
          organizationPath: '/workspace/overview',
        }),
        visibilityFlagKey: APP_SWITCHER_FEATURE_FLAGS.workspace,
      },
      {
        activePathRoots: ['/agent'],
        description: 'Ask and execute.',
        icon: Terminal,
        id: 'agent',
        itemKey: 'agent',
        label: APP_DISPLAY_LABELS.agent,
        route: createScopedAppRoute({ brandPath: '/agent' }),
        visibilityFlagKey: APP_SWITCHER_FEATURE_FLAGS.agent,
      },
      {
        activePathRoots: ['/messages'],
        description: 'Reply to audience.',
        icon: MessageSquare,
        id: 'messages',
        itemKey: 'messages',
        label: APP_DISPLAY_LABELS.messages,
        route: createScopedAppRoute({ brandPath: '/messages' }),
        visibilityFlagKey: APP_SWITCHER_FEATURE_FLAGS.messages,
      },
      {
        activePathRoots: ['/automation'],
        description: 'Run workflows.',
        icon: Workflow,
        id: 'automation',
        itemKey: 'automation',
        label: APP_DISPLAY_LABELS.automation,
        route: createScopedAppRoute({
          brandPath: '/automation',
        }),
        visibilityFlagKey: APP_SWITCHER_FEATURE_FLAGS.automation,
      },
      {
        activePathRoots: ['/studio'],
        description: 'Create assets.',
        icon: LayoutGrid,
        id: 'studio',
        itemKey: 'studio',
        label: APP_DISPLAY_LABELS.studio,
        // Studio production tools require a brand. The org route hands one-off
        // generation to Agent while preserving a stable switcher destination.
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
        itemKey: 'library',
        label: APP_DISPLAY_LABELS.library,
        route: createScopedAppRoute({
          brandPath: '/library',
          organizationPath: '/library',
        }),
        visibilityFlagKey: APP_SWITCHER_FEATURE_FLAGS.library,
      },
      {
        activePathRoots: ['/discovery'],
        description: 'Find winners.',
        icon: TrendingUp,
        id: 'discovery',
        itemKey: 'discovery',
        label: APP_DISPLAY_LABELS.discovery,
        route: createScopedAppRoute({ brandPath: '/discovery/overview' }),
        visibilityFlagKey: APP_SWITCHER_FEATURE_FLAGS.discovery,
      },
      {
        activePathRoots: ['/publishing'],
        description: 'Drafts and posts.',
        icon: Send,
        id: 'publishing',
        itemKey: 'publishing',
        label: APP_DISPLAY_LABELS.publishing,
        route: createScopedAppRoute({ brandPath: '/publishing' }),
        visibilityFlagKey: APP_SWITCHER_FEATURE_FLAGS.publishing,
      },
      {
        activePathRoots: ['/analytics'],
        description: 'Measure results.',
        icon: ChartNoAxesColumn,
        id: 'analytics',
        itemKey: 'analytics',
        label: APP_DISPLAY_LABELS.analytics,
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
      label: APP_DISPLAY_LABELS.admin,
      route: () => APP_ROUTES.ADMIN.OVERVIEW.DASHBOARD,
    },
  ],
};

/** Optional icon overrides for a few tiles in the flat grid. */
const APP_SWITCHER_ICON_OVERRIDES: Partial<
  Record<string, LifecycleAppSwitcherItemConfig['icon']>
> = {
  automation: Workflow,
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
  onPreviewShow,
}: {
  app: LifecycleAppSwitcherItemConfig;
  isActive: boolean;
  isLocked?: boolean;
  href: string;
  navigationAnnouncement?: string;
  onNavigateStart: (announcement?: string) => void;
  onPreviewShow: (
    app: LifecycleAppSwitcherItemConfig,
    target: HTMLElement,
  ) => void;
}) {
  const Icon = APP_SWITCHER_ICON_OVERRIDES[app.itemKey] ?? app.icon;

  return (
    <DropdownMenuItem asChild>
      <Link
        href={href}
        aria-current={isActive ? 'page' : undefined}
        aria-describedby={`app-switcher-desc-${app.itemKey}`}
        aria-label={
          isLocked
            ? `${app.label} — locked. Generate your first asset to unlock.`
            : undefined
        }
        onClick={() => onNavigateStart(navigationAnnouncement)}
        onFocus={(event) => onPreviewShow(app, event.currentTarget)}
        onMouseEnter={(event) => onPreviewShow(app, event.currentTarget)}
        className={cn(
          'group grid min-h-[4.375rem] min-w-0 grid-rows-[2rem_1.125rem] place-items-center gap-1.5 rounded-lg p-2 text-center outline-none',
          'border-transparent !bg-transparent !shadow-none !ring-0 !ring-offset-0',
          'focus:text-inherit data-[highlighted]:text-inherit',
        )}
      >
        <span
          className={cn(
            'relative inline-flex size-8 items-center justify-center rounded-lg bg-background-secondary text-foreground/58 transition-colors',
            isActive
              ? 'bg-foreground text-background'
              : 'group-hover:bg-foreground group-hover:text-background group-focus-visible:bg-foreground group-focus-visible:text-background',
            isLocked && 'opacity-60',
          )}
        >
          <Icon aria-hidden="true" className="size-4" />
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
        <span id={`app-switcher-desc-${app.itemKey}`} className="sr-only">
          {app.description}
          {isLocked ? ' Generate your first asset to unlock.' : null}
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
  const switcherPanelRef = useRef<HTMLDivElement>(null);
  const [navigationAnnouncement, setNavigationAnnouncement] = useState('');
  const [previewAppKey, setPreviewAppKey] = useState<string | null>(null);
  const [previewTop, setPreviewTop] = useState(0);
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);

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

  const showPreview = (
    app: LifecycleAppSwitcherItemConfig,
    target: HTMLElement,
  ) => {
    const panel = switcherPanelRef.current;
    if (panel) {
      const panelRect = panel.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      setPreviewTop(targetRect.top - panelRect.top);
    }
    setPreviewAppKey(app.itemKey);
    setIsPreviewVisible(true);
  };

  const hidePreview = () => {
    setIsPreviewVisible(false);
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
  const previewApp = apps.find((app) => app.itemKey === previewAppKey) ?? null;
  const PreviewIcon = previewApp
    ? (APP_SWITCHER_ICON_OVERRIDES[previewApp.itemKey] ?? previewApp.icon)
    : null;
  const ActiveIcon = activeApp?.icon ?? LayoutGrid;
  const activeLabel = activeApp?.label ?? 'Apps';
  const tenantLabel = humanizeSlug(brandSlug || orgSlug);

  // Flat grid of every flag-visible app (curation list removed — no dual
  // primary/secondary list that diverged from what actually rendered).
  if (apps.length === 0) {
    return null;
  }

  return (
    <DropdownMenu
      modal={false}
      onOpenChange={(open) => {
        if (!open) {
          hidePreview();
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        {variant === 'labeled' ? (
          <Button
            type="button"
            variant={ButtonVariant.GHOST}
            size={ButtonSize.SM}
            className="flex items-center gap-2 rounded-md px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            ariaLabel="Switch app"
          >
            <ActiveIcon className="size-4 shrink-0 text-foreground/70" />
            <span className="max-w-[12rem] truncate text-sm font-semibold text-foreground">
              {activeLabel}
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
          </Button>
        ) : (
          <Button
            type="button"
            variant={ButtonVariant.GHOST}
            size={ButtonSize.MICRO}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            ariaLabel="Switch app"
          >
            <Grip className="size-4" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        collisionPadding={16}
        className="w-[calc(100vw-2rem)] overflow-visible bg-transparent p-0 shadow-none sm:w-[16.25rem]"
        onCloseAutoFocus={(event) => {
          if (!preventTriggerAutoFocusRef.current) {
            return;
          }

          event.preventDefault();
          preventTriggerAutoFocusRef.current = false;
        }}
      >
        <div
          ref={switcherPanelRef}
          className="relative max-h-[min(80vh,30rem)] rounded-lg bg-secondary p-2 shadow-dropdown"
          data-app-switcher-panel=""
        >
          <div
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute right-[calc(100%+0.5rem)] z-20 hidden w-60 origin-right rounded-lg bg-secondary p-2.5 shadow-dropdown sm:block',
              'transition-[opacity,transform,top] duration-200 ease-out will-change-transform motion-reduce:transform-none motion-reduce:transition-none',
              isPreviewVisible && previewApp
                ? 'translate-x-0 scale-100 opacity-100'
                : 'translate-x-3 scale-[0.96] opacity-0',
            )}
            data-app-switcher-preview=""
            data-state={isPreviewVisible && previewApp ? 'open' : 'closed'}
            style={{ top: previewTop }}
          >
            {previewApp && PreviewIcon ? (
              <div className="flex items-start gap-2.5">
                <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-background-secondary text-foreground">
                  <PreviewIcon aria-hidden="true" className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold leading-tight text-foreground">
                    {previewApp.label}
                  </span>
                  <span className="mt-1 block text-xs leading-snug text-muted-foreground">
                    {previewApp.description}
                  </span>
                </span>
              </div>
            ) : null}
          </div>

          <div className="min-h-0 overflow-y-auto">
            <div className="mb-2 flex items-center justify-between gap-3 px-1">
              <div className="text-2xs font-bold uppercase tracking-[0.16em] text-foreground/52">
                Apps
              </div>
              <div className="min-w-0 truncate text-sm font-semibold text-foreground/58">
                {tenantLabel}
              </div>
            </div>

            <div
              className="grid grid-cols-3 gap-1.5"
              role="group"
              aria-label="Apps"
              onBlurCapture={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                  hidePreview();
                }
              }}
              onMouseLeave={hidePreview}
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
                    onPreviewShow={showPreview}
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
          </div>
        </div>
      </DropdownMenuContent>
      <span aria-live="polite" className="sr-only" role="status">
        {navigationAnnouncement}
      </span>
    </DropdownMenu>
  );
}

export default AppSwitcher;
