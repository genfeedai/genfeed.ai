'use client';

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
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlinePaperAirplane,
  HiOutlineRectangleStack,
  HiOutlineSquares2X2,
  HiOutlineViewColumns,
} from 'react-icons/hi2';
import { TbGridDots } from 'react-icons/tb';
import { Button } from '../../../primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
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
          brand ? `/${org}/${brand}/research/discovery` : `/${org}/~/overview`,
      },
      {
        description: 'Watch platforms.',
        icon: HiOutlineSquares2X2,
        id: 'research',
        itemKey: 'trends-socials',
        label: 'Socials',
        route: (org, brand) =>
          brand ? `/${org}/${brand}/research/socials` : `/${org}/~/overview`,
      },
      {
        description: 'Study ads.',
        icon: HiOutlineViewColumns,
        id: 'research',
        itemKey: 'trends-ads',
        label: 'Ads',
        route: (org, brand) =>
          brand ? `/${org}/${brand}/research/ads` : `/${org}/~/overview`,
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
          brand ? `/${org}/${brand}/studio/image` : `/${org}/~/studio/image`,
      },
      {
        description: 'Adapt winners.',
        icon: HiOutlineArrowPathRoundedSquare,
        id: 'remix',
        itemKey: 'create-remix',
        label: 'Remix',
        route: (org, brand) =>
          brand ? `/${org}/${brand}/posts/remix` : `/${org}/~/posts`,
      },
      {
        description: 'Use source assets.',
        icon: HiOutlineRectangleStack,
        id: 'library',
        itemKey: 'create-library',
        label: 'Library',
        route: (org, brand) =>
          brand ? `/${org}/${brand}/library/ingredients` : `/${org}/~/library`,
      },
      {
        description: 'Scale creation.',
        icon: HiOutlineRectangleStack,
        id: 'studio',
        itemKey: 'create-batch',
        label: 'Batch',
        route: (org, brand) =>
          brand ? `/${org}/${brand}/studio/batch` : `/${org}/~/studio/batch`,
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
          brand ? `/${org}/${brand}/posts` : `/${org}/~/posts`,
      },
      {
        description: 'Approve content.',
        icon: HiOutlineCheckCircle,
        id: 'posts',
        itemKey: 'publish-review',
        label: 'Review',
        route: (org, brand) =>
          brand ? `/${org}/${brand}/posts/review` : `/${org}/~/posts`,
      },
      {
        description: 'Plan schedule.',
        icon: HiOutlineViewColumns,
        id: 'posts',
        itemKey: 'publish-calendar',
        label: 'Calendar',
        route: (org, brand) =>
          brand ? `/${org}/${brand}/posts/calendar` : `/${org}/~/posts`,
      },
      {
        description: 'Queued posts.',
        icon: HiOutlineClock,
        id: 'posts',
        itemKey: 'publish-scheduled',
        label: 'Scheduled',
        route: (org, brand) =>
          brand ? `/${org}/${brand}/posts/scheduled` : `/${org}/~/posts`,
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
            ? `/${org}/${brand}/analytics/overview`
            : `/${org}/~/analytics/overview`,
      },
      {
        description: 'Inspect posts.',
        icon: HiOutlinePaperAirplane,
        id: 'analytics',
        itemKey: 'analytics-posts',
        label: 'Post Analytics',
        route: (org, brand) =>
          brand
            ? `/${org}/${brand}/analytics/posts`
            : `/${org}/~/analytics/overview`,
      },
      {
        description: 'Spot patterns.',
        icon: HiOutlineArrowTrendingUp,
        id: 'analytics',
        itemKey: 'analytics-trends',
        label: 'Trend Analytics',
        route: (org, brand) =>
          brand
            ? `/${org}/${brand}/analytics/trends`
            : `/${org}/~/analytics/overview`,
      },
      {
        activeIds: ['workflows'],
        description: 'Systematize wins.',
        icon: HiOutlineArrowPathRoundedSquare,
        id: 'workflows',
        itemKey: 'analytics-repeat',
        label: 'Repeat',
        route: (org, brand) =>
          brand ? `/${org}/${brand}/workflows` : `/${org}/~/workflows`,
      },
    ],
  },
];

const SECTION_APPS = APP_SWITCHER_SECTIONS.flatMap((section) => section.apps);

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
  brandSlug,
  currentApp,
  currentPath,
  orgSlug,
}: {
  brandSlug?: string;
  currentApp: AppContext;
  currentPath?: string;
  orgSlug: string;
}): string | undefined {
  const normalizedCurrentPath = normalizePath(currentPath);

  if (normalizedCurrentPath) {
    let activeItemKey: string | undefined;
    let activeScore = 0;

    for (const app of SECTION_APPS) {
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

  return SECTION_APPS.find((app) => isActiveApp(app, currentApp))?.itemKey;
}

function AppDropdownItem({
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
          'flex min-h-11 items-start gap-2.5 rounded-md border border-transparent p-2 text-left text-[13px] outline-none transition-colors',
          'hover:bg-foreground/[0.06] focus:bg-foreground/[0.06]',
          isActive && 'border-foreground/[0.08] bg-foreground/[0.06]',
        )}
      >
        <Icon
          className={cn(
            'mt-0.5 size-4 shrink-0',
            isActive ? 'text-foreground' : 'text-foreground/50',
          )}
        />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span
            className={cn(
              'truncate',
              isActive
                ? 'font-medium text-foreground'
                : 'font-medium text-foreground/85',
            )}
          >
            {app.label}
          </span>
          <span
            aria-hidden="true"
            className="truncate text-[12px] leading-4 text-foreground/45"
          >
            {app.description}
          </span>
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
  variant = 'icon',
}: AppSwitcherProps) {
  const preventTriggerAutoFocusRef = useRef(false);

  function getAppHref(app: AppSwitcherItemConfig) {
    return withPreservedSearch(app.route(orgSlug, brandSlug), preservedSearch);
  }

  const handleNavigateStart = () => {
    preventTriggerAutoFocusRef.current = true;
  };

  const activeItemKey = getActiveItemKey({
    brandSlug,
    currentApp,
    currentPath,
    orgSlug,
  });
  const activeApp =
    SECTION_APPS.find((app) => app.itemKey === activeItemKey) ??
    SECTION_APPS.find((app) => isActiveApp(app, currentApp));
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
        className="max-h-[80vh] w-[calc(100vw-2rem)] overflow-y-auto p-2 sm:w-[44rem]"
        onCloseAutoFocus={(event) => {
          if (!preventTriggerAutoFocusRef.current) {
            return;
          }

          event.preventDefault();
          preventTriggerAutoFocusRef.current = false;
        }}
      >
        <div className="grid gap-2 sm:grid-cols-4">
          {APP_SWITCHER_SECTIONS.map((section) => (
            <div
              key={section.id}
              aria-labelledby={`app-switcher-${section.id}`}
              className="min-w-0"
              role="group"
            >
              <DropdownMenuLabel
                id={`app-switcher-${section.id}`}
                className="px-2 pb-1 pt-0"
              >
                {section.label}
              </DropdownMenuLabel>
              <div className="space-y-1">
                {section.apps.map((app) => (
                  <AppDropdownItem
                    key={app.itemKey}
                    app={app}
                    isActive={app.itemKey === activeItemKey}
                    href={getAppHref(app)}
                    onNavigateStart={handleNavigateStart}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default AppSwitcher;
