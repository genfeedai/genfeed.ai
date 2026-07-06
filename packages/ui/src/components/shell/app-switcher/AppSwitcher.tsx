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
import { useRef } from 'react';
import {
  HiChevronDown,
  HiOutlineArrowPathRoundedSquare,
  HiOutlineArrowTrendingUp,
  HiOutlineChartBarSquare,
  HiOutlineChatBubbleLeftRight,
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineCommandLine,
  HiOutlinePaperAirplane,
  HiOutlineRectangleStack,
  HiOutlineShieldCheck,
  HiOutlineSquares2X2,
  HiOutlineViewColumns,
} from 'react-icons/hi2';
import { TbGridDots } from 'react-icons/tb';
import { Button } from '../../../primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '../../../primitives/dropdown-menu';

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

function AppSwitcherMenuItem({
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
  const Icon = app.icon;

  return (
    <DropdownMenuItem asChild>
      <Link
        href={href}
        aria-current={isActive ? 'page' : undefined}
        onClick={onNavigateStart}
        className={cn(
          'group flex min-h-10 min-w-0 items-start gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] outline-none transition-colors',
          'hover:bg-foreground/[0.06] focus:bg-foreground/[0.06]',
          isActive && 'bg-foreground/[0.08] shadow-border-strong',
        )}
      >
        <Icon
          className={cn(
            'mt-0.5 size-4 shrink-0 transition-colors',
            isActive
              ? 'text-foreground'
              : 'text-foreground/50 group-hover:text-foreground/78',
          )}
        />
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'block truncate leading-5',
              isActive
                ? 'font-medium text-foreground'
                : 'font-medium text-foreground/85',
            )}
          >
            {app.label}
          </span>
          <span
            aria-hidden="true"
            className="mt-0.5 block truncate text-[12px] leading-4 text-foreground/52"
          >
            {app.description}
          </span>
        </span>
      </Link>
    </DropdownMenuItem>
  );
}

function AppSwitcherMenuSection({
  activeItemKey,
  getAppHref,
  onNavigateStart,
  section,
}: {
  activeItemKey?: string;
  getAppHref: (app: AppSwitcherItemConfig) => string;
  onNavigateStart: () => void;
  section: AppSwitcherSectionConfig;
}) {
  return (
    <DropdownMenuGroup
      key={section.id}
      aria-labelledby={`app-switcher-${section.id}`}
      className="min-w-0"
    >
      <DropdownMenuLabel
        id={`app-switcher-${section.id}`}
        className="px-2 pb-1.5 pt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/42"
      >
        {section.label}
      </DropdownMenuLabel>
      <div className="space-y-0.5">
        {section.apps.map((app) => (
          <AppSwitcherMenuItem
            key={app.itemKey}
            app={app}
            isActive={app.itemKey === activeItemKey}
            href={getAppHref(app)}
            onNavigateStart={onNavigateStart}
          />
        ))}
      </div>
    </DropdownMenuGroup>
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

  function getAppHref(app: AppSwitcherItemConfig) {
    return withPreservedSearch(app.route(orgSlug, brandSlug), preservedSearch);
  }

  const handleNavigateStart = () => {
    preventTriggerAutoFocusRef.current = true;
  };

  const sections = showAdmin
    ? [...APP_SWITCHER_SECTIONS, ADMIN_APP_SWITCHER_SECTION]
    : APP_SWITCHER_SECTIONS;
  const apps = sections.flatMap((section) => section.apps);
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

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        {variant === 'labeled' ? (
          <Button
            type="button"
            variant={ButtonVariant.GHOST}
            className="flex h-7 items-center gap-2 rounded-md px-2 focus-visible:!outline-none focus-visible:!ring-0 focus-visible:!ring-offset-0"
            ariaLabel="Switch section"
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
            ariaLabel="Switch section"
          >
            <TbGridDots className="size-4" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="max-h-[80vh] w-[calc(100vw-2rem)] overflow-y-auto p-2 sm:w-[22rem]"
        onCloseAutoFocus={(event) => {
          if (!preventTriggerAutoFocusRef.current) {
            return;
          }

          event.preventDefault();
          preventTriggerAutoFocusRef.current = false;
        }}
      >
        <div className="border-b border-border px-2 pb-2 pt-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/42">
            Switch app
          </div>
          <div className="mt-1 flex items-center gap-2 text-sm font-medium text-foreground">
            <ActiveIcon className="size-4 shrink-0 text-foreground/70" />
            <span className="truncate">{activeLabel}</span>
          </div>
        </div>

        {sections.map((section) => (
          <AppSwitcherMenuSection
            key={section.id}
            section={section}
            activeItemKey={activeItemKey}
            getAppHref={getAppHref}
            onNavigateStart={handleNavigateStart}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default AppSwitcher;
