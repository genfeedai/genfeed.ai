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
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
            ? `/${org}/${brand}/workspace/overview`
            : `/${org}/~/workspace/overview`,
      },
      {
        description: 'Ask and execute.',
        icon: HiOutlineCommandLine,
        id: 'agent',
        itemKey: 'home-agent',
        label: 'Agent',
        route: (org) => `/${org}/~/agent`,
      },
      {
        description: 'Reply to audience.',
        icon: HiOutlineChatBubbleLeftRight,
        id: 'messages',
        itemKey: 'home-messages',
        label: 'Messages',
        route: (org, brand) =>
          brand ? `/${org}/${brand}/messages` : `/${org}/~/overview`,
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

const PRIMARY_APP_SWITCHER_SECTION_IDS = new Set(['home', 'create', 'publish']);

const SECONDARY_APP_SWITCHER_SECTION_IDS = new Set(['trends', 'analytics']);

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

function AppBoardTile({
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
          'flex min-h-[5.25rem] min-w-0 flex-col items-start rounded-md bg-foreground/[0.025] p-2 text-left text-[13px] outline-none transition-colors',
          'hover:bg-foreground/[0.06] focus:bg-foreground/[0.06]',
          isActive && 'bg-foreground/[0.06] shadow-border-strong',
        )}
      >
        <Icon
          className={cn(
            'mb-2 size-4 shrink-0',
            isActive ? 'text-foreground' : 'text-foreground/50',
          )}
        />
        <span className="flex min-w-0 flex-1 flex-col">
          <span
            className={cn(
              'break-words leading-4',
              isActive
                ? 'font-medium text-foreground'
                : 'font-medium text-foreground/85',
            )}
          >
            {app.label}
          </span>
          <span
            aria-hidden="true"
            className="mt-1 break-words text-[12px] leading-4 text-foreground/45"
          >
            {app.description}
          </span>
        </span>
      </Link>
    </DropdownMenuItem>
  );
}

function AppCompactItem({
  app,
  isActive,
  href,
  onNavigateStart,
  variant = 'inline',
}: {
  app: LifecycleAppSwitcherItemConfig;
  isActive: boolean;
  href: string;
  onNavigateStart: () => void;
  variant?: 'inline' | 'admin';
}) {
  const Icon = app.icon;

  return (
    <DropdownMenuItem asChild>
      <Link
        href={href}
        aria-current={isActive ? 'page' : undefined}
        onClick={onNavigateStart}
        className={cn(
          'min-w-0 rounded-md text-left text-[13px] outline-none transition-colors',
          'hover:bg-foreground/[0.06] focus:bg-foreground/[0.06]',
          isActive && 'bg-foreground/[0.06] shadow-border-strong',
          variant === 'admin'
            ? 'flex min-h-[3.25rem] items-start gap-2.5 px-2.5 py-2'
            : 'inline-flex min-h-7 items-center gap-1.5 px-2 py-1.5',
        )}
      >
        <Icon
          className={cn(
            'size-3.5 shrink-0',
            variant === 'admin' && 'mt-0.5',
            isActive ? 'text-foreground' : 'text-foreground/50',
          )}
        />
        <span className="min-w-0">
          <span
            className={cn(
              'block truncate',
              isActive
                ? 'font-medium text-foreground'
                : 'font-medium text-foreground/85',
            )}
          >
            {app.label}
          </span>
          {variant === 'admin' ? (
            <span
              aria-hidden="true"
              className="mt-0.5 block truncate text-[12px] leading-4 text-foreground/45"
            >
              {app.description}
            </span>
          ) : null}
        </span>
      </Link>
    </DropdownMenuItem>
  );
}

function AppBoardSection({
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
    <div
      key={section.id}
      aria-labelledby={`app-switcher-${section.id}`}
      className="min-w-0 rounded-md bg-foreground/[0.018] p-2 shadow-border"
      role="group"
    >
      <DropdownMenuLabel
        id={`app-switcher-${section.id}`}
        className="px-0 pb-2 pt-0"
      >
        {section.label}
      </DropdownMenuLabel>
      <div className="grid grid-cols-2 gap-1.5">
        {section.apps.map((app) => (
          <AppBoardTile
            key={app.itemKey}
            app={app}
            isActive={app.itemKey === activeItemKey}
            href={getAppHref(app)}
            onNavigateStart={onNavigateStart}
          />
        ))}
      </div>
    </div>
  );
}

function AppCompactSection({
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
    <div
      aria-labelledby={`app-switcher-${section.id}`}
      className="min-w-0"
      role="group"
    >
      <DropdownMenuLabel
        id={`app-switcher-${section.id}`}
        className="px-0 pb-1 pt-0"
      >
        {section.label}
      </DropdownMenuLabel>
      <div className="flex flex-wrap gap-1">
        {section.apps.map((app) => (
          <AppCompactItem
            key={app.itemKey}
            app={app}
            isActive={app.itemKey === activeItemKey}
            href={getAppHref(app)}
            onNavigateStart={onNavigateStart}
          />
        ))}
      </div>
    </div>
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
  const primarySections = APP_SWITCHER_SECTIONS.filter((section) =>
    PRIMARY_APP_SWITCHER_SECTION_IDS.has(section.id),
  );
  const secondarySections = APP_SWITCHER_SECTIONS.filter((section) =>
    SECONDARY_APP_SWITCHER_SECTION_IDS.has(section.id),
  );
  const adminSection = showAdmin ? ADMIN_APP_SWITCHER_SECTION : undefined;
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
        className="max-h-[80vh] w-[calc(100vw-2rem)] overflow-y-auto p-2 sm:w-[42rem]"
        onCloseAutoFocus={(event) => {
          if (!preventTriggerAutoFocusRef.current) {
            return;
          }

          event.preventDefault();
          preventTriggerAutoFocusRef.current = false;
        }}
      >
        <div className="grid gap-2 sm:grid-cols-3">
          {primarySections.map((section) => (
            <AppBoardSection
              key={section.id}
              section={section}
              activeItemKey={activeItemKey}
              getAppHref={getAppHref}
              onNavigateStart={handleNavigateStart}
            />
          ))}
        </div>

        <DropdownMenuSeparator className="my-2" />

        <div
          className={cn(
            'grid gap-2',
            adminSection && 'sm:grid-cols-[minmax(0,1fr)_12rem]',
          )}
        >
          <div className="grid min-w-0 gap-2 sm:grid-cols-2">
            {secondarySections.map((section) => (
              <AppCompactSection
                key={section.id}
                section={section}
                activeItemKey={activeItemKey}
                getAppHref={getAppHref}
                onNavigateStart={handleNavigateStart}
              />
            ))}
          </div>

          {adminSection ? (
            <div
              aria-labelledby={`app-switcher-${adminSection.id}`}
              className="min-w-0"
              role="group"
            >
              <DropdownMenuLabel
                id={`app-switcher-${adminSection.id}`}
                className="px-0 pb-1 pt-0"
              >
                {adminSection.label}
              </DropdownMenuLabel>
              {adminSection.apps.map((app) => (
                <AppCompactItem
                  key={app.itemKey}
                  app={app}
                  isActive={app.itemKey === activeItemKey}
                  href={getAppHref(app)}
                  onNavigateStart={handleNavigateStart}
                  variant="admin"
                />
              ))}
            </div>
          ) : null}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default AppSwitcher;
