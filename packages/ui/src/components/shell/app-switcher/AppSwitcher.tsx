'use client';

import {
  createBrandAppRoute,
  createOrganizationAppRoute,
} from '@genfeedai/constants';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { AppContext, AppSwitcherItemConfig } from '@genfeedai/interfaces';
import type { AppSwitcherProps } from '@genfeedai/props/ui/app-switcher.props';
import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import {
  HiChevronDown,
  HiOutlineArrowPathRoundedSquare,
  HiOutlineArrowTrendingUp,
  HiOutlineBriefcase,
  HiOutlineChartBarSquare,
  HiOutlineChatBubbleLeftRight,
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineCommandLine,
  HiOutlineMagnifyingGlass,
  HiOutlineMegaphone,
  HiOutlinePaperAirplane,
  HiOutlineRectangleStack,
  HiOutlineShieldCheck,
  HiOutlineSignal,
  HiOutlineSparkles,
  HiOutlineSquares2X2,
  HiOutlineViewColumns,
} from 'react-icons/hi2';
import { TbGridDots } from 'react-icons/tb';
import { Button } from '../../../primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../primitives/dropdown-menu';
import { Input } from '../../../primitives/input';

type LifecycleAppSwitcherItemConfig = AppSwitcherItemConfig & {
  activeIds?: AppContext[];
  description: string;
  itemKey: string;
};

type AppSwitcherSectionConfig = {
  id: string;
  label: string;
  apps: LifecycleAppSwitcherItemConfig[];
};

const APP_SWITCHER_SECTIONS: AppSwitcherSectionConfig[] = [
  {
    id: 'home',
    label: 'Home',
    apps: [
      {
        description: 'Command center.',
        icon: HiOutlineSquares2X2,
        id: 'workspace',
        itemKey: 'home-workspace',
        label: 'Workspace',
        route: (org, brand) =>
          brand
            ? createBrandAppRoute(org, brand, '/workspace/overview')
            : createOrganizationAppRoute(org, '/workspace/overview'),
      },
      {
        description: 'Ask and execute.',
        icon: HiOutlineCommandLine,
        id: 'agent',
        itemKey: 'home-agent',
        label: 'Agent',
        route: (org) => createOrganizationAppRoute(org, '/agent'),
      },
      {
        description: 'Reply to audience.',
        icon: HiOutlineChatBubbleLeftRight,
        id: 'messages',
        itemKey: 'home-messages',
        label: 'Messages',
        route: (org, brand) =>
          brand
            ? createBrandAppRoute(org, brand, '/messages')
            : createOrganizationAppRoute(org, '/overview'),
      },
    ],
  },
  {
    id: 'trends',
    label: 'Trends',
    apps: [
      {
        description: 'Find winners.',
        icon: HiOutlineArrowTrendingUp,
        id: 'research',
        itemKey: 'trends-discovery',
        label: 'Discovery',
        route: (org, brand) =>
          brand
            ? createBrandAppRoute(org, brand, '/research/discovery')
            : createOrganizationAppRoute(org, '/overview'),
      },
      {
        description: 'Watch platforms.',
        icon: HiOutlineSquares2X2,
        id: 'research',
        itemKey: 'trends-socials',
        label: 'Socials',
        route: (org, brand) =>
          brand
            ? createBrandAppRoute(org, brand, '/research/socials')
            : createOrganizationAppRoute(org, '/overview'),
      },
      {
        description: 'Study ads.',
        icon: HiOutlineViewColumns,
        id: 'research',
        itemKey: 'trends-ads',
        label: 'Ads',
        route: (org, brand) =>
          brand
            ? createBrandAppRoute(org, brand, '/research/ads')
            : createOrganizationAppRoute(org, '/overview'),
      },
    ],
  },
  {
    id: 'create',
    label: 'Create',
    apps: [
      {
        activeIds: ['studio', 'compose', 'editor'],
        description: 'Generate media.',
        icon: HiOutlineSquares2X2,
        id: 'studio',
        itemKey: 'create-studio',
        label: 'Studio',
        route: (org, brand) =>
          brand
            ? createBrandAppRoute(org, brand, '/studio/image')
            : createOrganizationAppRoute(org, '/studio/image'),
      },
      {
        description: 'Adapt winners.',
        icon: HiOutlineArrowPathRoundedSquare,
        id: 'remix',
        itemKey: 'create-remix',
        label: 'Remix',
        route: (org, brand) =>
          brand
            ? createBrandAppRoute(org, brand, '/posts/remix')
            : createOrganizationAppRoute(org, '/posts'),
      },
      {
        description: 'Use source assets.',
        icon: HiOutlineRectangleStack,
        id: 'library',
        itemKey: 'create-library',
        label: 'Library',
        route: (org, brand) =>
          brand
            ? createBrandAppRoute(org, brand, '/library/ingredients')
            : createOrganizationAppRoute(org, '/library'),
      },
      {
        description: 'Scale creation.',
        icon: HiOutlineRectangleStack,
        id: 'studio',
        itemKey: 'create-batch',
        label: 'Batch',
        route: (org, brand) =>
          brand
            ? createBrandAppRoute(org, brand, '/studio/batch')
            : createOrganizationAppRoute(org, '/studio/batch'),
      },
    ],
  },
  {
    id: 'publish',
    label: 'Publish',
    apps: [
      {
        description: 'Drafts and posts.',
        icon: HiOutlinePaperAirplane,
        id: 'posts',
        itemKey: 'publish-posts',
        label: 'Posts',
        route: (org, brand) =>
          brand
            ? createBrandAppRoute(org, brand, '/posts')
            : createOrganizationAppRoute(org, '/posts'),
      },
      {
        description: 'Approve content.',
        icon: HiOutlineCheckCircle,
        id: 'posts',
        itemKey: 'publish-review',
        label: 'Review',
        route: (org, brand) =>
          brand
            ? createBrandAppRoute(org, brand, '/posts/review')
            : createOrganizationAppRoute(org, '/posts'),
      },
      {
        description: 'Plan schedule.',
        icon: HiOutlineViewColumns,
        id: 'posts',
        itemKey: 'publish-calendar',
        label: 'Calendar',
        route: (org, brand) =>
          brand
            ? createBrandAppRoute(org, brand, '/posts/calendar')
            : createOrganizationAppRoute(org, '/posts'),
      },
      {
        description: 'Queued posts.',
        icon: HiOutlineClock,
        id: 'posts',
        itemKey: 'publish-scheduled',
        label: 'Scheduled',
        route: (org, brand) =>
          brand
            ? createBrandAppRoute(org, brand, '/posts/scheduled')
            : createOrganizationAppRoute(org, '/posts'),
      },
    ],
  },
  {
    id: 'analytics',
    label: 'Analytics',
    apps: [
      {
        description: 'Measure results.',
        icon: HiOutlineChartBarSquare,
        id: 'analytics',
        itemKey: 'analytics-overview',
        label: 'Overview',
        route: (org, brand) =>
          brand
            ? createBrandAppRoute(org, brand, '/analytics/overview')
            : createOrganizationAppRoute(org, '/analytics/overview'),
      },
      {
        description: 'Inspect posts.',
        icon: HiOutlinePaperAirplane,
        id: 'analytics',
        itemKey: 'analytics-posts',
        label: 'Post Analytics',
        route: (org, brand) =>
          brand
            ? createBrandAppRoute(org, brand, '/analytics/posts')
            : createOrganizationAppRoute(org, '/analytics/overview'),
      },
      {
        description: 'Spot patterns.',
        icon: HiOutlineArrowTrendingUp,
        id: 'analytics',
        itemKey: 'analytics-trends',
        label: 'Trend Analytics',
        route: (org, brand) =>
          brand
            ? createBrandAppRoute(org, brand, '/analytics/trends')
            : createOrganizationAppRoute(org, '/analytics/overview'),
      },
      {
        activeIds: ['workflows'],
        description: 'Systematize wins.',
        icon: HiOutlineArrowPathRoundedSquare,
        id: 'workflows',
        itemKey: 'analytics-repeat',
        label: 'Repeat',
        route: (org, brand) =>
          brand
            ? createBrandAppRoute(org, brand, '/workflows')
            : createOrganizationAppRoute(org, '/workflows'),
      },
    ],
  },
];

const ADMIN_APP_SWITCHER_SECTION: AppSwitcherSectionConfig = {
  id: 'admin',
  label: 'Administration',
  apps: [
    {
      description: 'Platform management.',
      icon: HiOutlineShieldCheck,
      id: 'admin',
      itemKey: 'admin',
      label: 'Admin',
      route: () => '/admin',
    },
  ],
};

const PRIMARY_APP_ITEM_KEYS = [
  'home-workspace',
  'home-agent',
  'home-messages',
  'trends-discovery',
  'trends-socials',
  'trends-ads',
  'create-studio',
  'create-remix',
  'create-library',
] as const;

const PRIMARY_APP_ICONS: Partial<
  Record<
    (typeof PRIMARY_APP_ITEM_KEYS)[number],
    LifecycleAppSwitcherItemConfig['icon']
  >
> = {
  'create-library': HiOutlineBriefcase,
  'create-studio': HiOutlineSparkles,
  'trends-ads': HiOutlineMegaphone,
  'trends-socials': HiOutlineSignal,
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

function isPrimaryApp(app: LifecycleAppSwitcherItemConfig): boolean {
  return PRIMARY_APP_ITEM_KEYS.includes(
    app.itemKey as (typeof PRIMARY_APP_ITEM_KEYS)[number],
  );
}

function getPrimaryApps(
  apps: LifecycleAppSwitcherItemConfig[],
): LifecycleAppSwitcherItemConfig[] {
  return PRIMARY_APP_ITEM_KEYS.map((itemKey) =>
    apps.find((app) => app.itemKey === itemKey),
  ).filter((app): app is LifecycleAppSwitcherItemConfig => Boolean(app));
}

function matchesAppSearch({
  app,
  query,
  sectionLabel,
}: {
  app: LifecycleAppSwitcherItemConfig;
  query: string;
  sectionLabel?: string;
}): boolean {
  const haystack = [app.label, app.description, app.itemKey, sectionLabel]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes(query);
}

function isActiveApp(
  app: LifecycleAppSwitcherItemConfig,
  currentApp: AppContext,
): boolean {
  return app.id === currentApp || app.activeIds?.includes(currentApp) === true;
}

function normalizePath(path?: string): string | undefined {
  if (!path) {
    return undefined;
  }

  const [pathname] = path.split('?', 1);
  const normalizedPathname = pathname.replace(/\/+$/, '');

  return normalizedPathname || '/';
}

function getPathMatchScore(currentPath: string, targetPath: string): number {
  const normalizedCurrentPath = normalizePath(currentPath);
  const normalizedTargetPath = normalizePath(targetPath);

  if (!(normalizedCurrentPath && normalizedTargetPath)) {
    return 0;
  }

  if (normalizedCurrentPath === normalizedTargetPath) {
    return normalizedTargetPath.length + 1000;
  }

  if (normalizedCurrentPath.startsWith(`${normalizedTargetPath}/`)) {
    return normalizedTargetPath.length;
  }

  return 0;
}

function getActiveItemKey({
  apps,
  brandSlug,
  currentApp,
  currentPath,
  orgSlug,
}: {
  apps: LifecycleAppSwitcherItemConfig[];
  brandSlug?: string;
  currentApp: AppContext;
  currentPath?: string;
  orgSlug: string;
}): string | undefined {
  const normalizedCurrentPath = normalizePath(currentPath);

  if (normalizedCurrentPath) {
    let activeItemKey: string | undefined;
    let activeScore = 0;

    for (const app of apps) {
      const score = getPathMatchScore(
        normalizedCurrentPath,
        app.route(orgSlug, brandSlug),
      );

      if (score > activeScore) {
        activeItemKey = app.itemKey;
        activeScore = score;
      }
    }

    if (activeItemKey) {
      return activeItemKey;
    }
  }

  return apps.find((app) => isActiveApp(app, currentApp))?.itemKey;
}

function AppSwitcherGridItem({
  app,
  isActive,
  href,
  onNavigateStart,
}: {
  app: LifecycleAppSwitcherItemConfig;
  isActive: boolean;
  href: string;
  onNavigateStart: () => void;
}) {
  const Icon =
    PRIMARY_APP_ICONS[app.itemKey as (typeof PRIMARY_APP_ITEM_KEYS)[number]] ??
    app.icon;

  return (
    <DropdownMenuItem asChild>
      <Link
        href={href}
        aria-current={isActive ? 'page' : undefined}
        onClick={onNavigateStart}
        className={cn(
          'group grid min-h-[5.75rem] min-w-0 grid-rows-[2.75rem_1.25rem] place-items-center gap-1.5 rounded-lg border border-transparent px-1.5 py-2 text-center outline-none transition-colors',
          'hover:border-border hover:bg-foreground/[0.04] focus:border-border focus:bg-foreground/[0.06]',
          isActive &&
            'border-border-strong bg-foreground/[0.08] shadow-border-strong',
        )}
      >
        <span
          className={cn(
            'inline-flex size-10 items-center justify-center rounded-lg bg-background-secondary text-foreground/58 transition-colors',
            isActive
              ? 'bg-foreground text-background'
              : 'group-hover:text-foreground/82',
          )}
        >
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <span
          className={cn(
            'block max-w-full truncate text-[13px] font-semibold leading-5',
            isActive ? 'text-foreground' : 'text-foreground/58',
          )}
        >
          {app.label}
        </span>
      </Link>
    </DropdownMenuItem>
  );
}

export function AppSwitcher({
  brandSlug,
  currentApp,
  currentPath,
  orgSlug,
  preservedSearch,
  showAdmin = false,
  variant = 'icon',
}: AppSwitcherProps) {
  const preventTriggerAutoFocusRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState('');

  function getAppHref(app: AppSwitcherItemConfig) {
    return withPreservedSearch(app.route(orgSlug, brandSlug), preservedSearch);
  }

  const handleNavigateStart = () => {
    preventTriggerAutoFocusRef.current = true;
  };

  const sections = useMemo(
    () =>
      showAdmin
        ? [...APP_SWITCHER_SECTIONS, ADMIN_APP_SWITCHER_SECTION]
        : APP_SWITCHER_SECTIONS,
    [showAdmin],
  );
  const apps = useMemo(
    () => sections.flatMap((section) => section.apps),
    [sections],
  );
  const sectionLabelByItemKey = useMemo(() => {
    const labels = new Map<string, string>();

    for (const section of sections) {
      for (const app of section.apps) {
        labels.set(app.itemKey, section.label);
      }
    }

    return labels;
  }, [sections]);
  const activeItemKey = getActiveItemKey({
    apps,
    brandSlug,
    currentApp,
    currentPath,
    orgSlug,
  });
  const activeApp =
    apps.find((app) => app.itemKey === activeItemKey) ??
    apps.find((app) => isActiveApp(app, currentApp));
  const ActiveIcon = activeApp?.icon ?? HiOutlineSquares2X2;
  const activeLabel = activeApp?.label ?? 'Apps';
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const visibleApps = useMemo(() => {
    if (normalizedSearchQuery) {
      return apps.filter((app) =>
        matchesAppSearch({
          app,
          query: normalizedSearchQuery,
          sectionLabel: sectionLabelByItemKey.get(app.itemKey),
        }),
      );
    }

    const primaryApps = getPrimaryApps(apps);

    if (activeApp && !isPrimaryApp(activeApp)) {
      return [...primaryApps, activeApp];
    }

    return primaryApps;
  }, [activeApp, apps, normalizedSearchQuery, sectionLabelByItemKey]);
  const tenantLabel = humanizeSlug(brandSlug || orgSlug);

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        {variant === 'labeled' ? (
          <Button
            type="button"
            variant={ButtonVariant.GHOST}
            className="flex h-7 items-center gap-2 rounded-md px-2 focus-visible:!outline-none focus-visible:!ring-0 focus-visible:!ring-offset-0"
            ariaLabel="Switch app"
          >
            <ActiveIcon className="size-4 shrink-0 text-foreground/70" />
            <span className="max-w-[12rem] truncate text-[13px] font-semibold text-foreground">
              {activeLabel}
            </span>
            <HiChevronDown className="size-3.5 shrink-0 text-foreground/45" />
          </Button>
        ) : (
          <Button
            type="button"
            variant={ButtonVariant.GHOST}
            size={ButtonSize.ICON}
            className="size-7 focus-visible:!outline-none focus-visible:!ring-0 focus-visible:!ring-offset-0"
            ariaLabel="Switch app"
          >
            <TbGridDots className="size-4" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="max-h-[min(80vh,38rem)] w-[calc(100vw-2rem)] overflow-y-auto p-0 sm:w-[23.5rem]"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          searchInputRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          setSearchQuery('');

          if (!preventTriggerAutoFocusRef.current) {
            return;
          }

          event.preventDefault();
          preventTriggerAutoFocusRef.current = false;
        }}
      >
        <div className="flex min-h-12 items-center justify-between gap-3 border-b border-border px-3.5 py-2.5">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-foreground/52">
            Apps
          </div>
          <div className="min-w-0 truncate text-[13px] font-semibold text-foreground/58">
            {tenantLabel}
          </div>
        </div>

        <div className="px-3.5 pt-3">
          <div className="relative">
            <HiOutlineMagnifyingGlass
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground/42"
            />
            <Input
              ref={searchInputRef}
              aria-label="Search apps"
              className="h-10 rounded-lg border-border bg-background-secondary pl-9 pr-3 text-[13px] font-medium placeholder:text-foreground/46"
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => event.stopPropagation()}
              placeholder="Search apps"
              type="search"
              value={searchQuery}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-x-1 gap-y-2 px-3.5 py-3.5">
          {visibleApps.map((app) => (
            <AppSwitcherGridItem
              key={app.itemKey}
              app={app}
              isActive={app.itemKey === activeItemKey}
              href={getAppHref(app)}
              onNavigateStart={handleNavigateStart}
            />
          ))}
        </div>

        {visibleApps.length === 0 ? (
          <div className="px-3.5 pb-4 text-center text-[12px] font-medium text-foreground/46">
            No apps found
          </div>
        ) : null}

        {normalizedSearchQuery ? (
          <div className="border-t border-border px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/42">
            Search results
          </div>
        ) : null}

        <div className="sr-only" aria-live="polite">
          {activeApp ? (
            <>
              Current app:
              <span className="truncate">{activeLabel}</span>
            </>
          ) : null}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default AppSwitcher;
