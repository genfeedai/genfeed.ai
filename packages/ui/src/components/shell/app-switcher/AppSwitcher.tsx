'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { AppContext, AppSwitcherItemConfig } from '@genfeedai/interfaces';
import type { AppSwitcherProps } from '@genfeedai/props/ui/app-switcher.props';
import Link from 'next/link';
import { useRef } from 'react';
import {
  HiChevronDown,
  HiOutlineChartBarSquare,
  HiOutlineChatBubbleLeftRight,
  HiOutlineFolder,
  HiOutlinePaperAirplane,
  HiOutlineRectangleGroup,
  HiOutlineShieldCheck,
  HiOutlineSparkles,
  HiOutlineSquares2X2,
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
};

type AppSwitcherSectionConfig = {
  id: string;
  label: string;
  apps: LifecycleAppSwitcherItemConfig[];
};

const APP_SWITCHER_SECTIONS: AppSwitcherSectionConfig[] = [
  {
    id: 'workspace',
    label: 'Workspace',
    apps: [
      {
        description: 'Dashboard and context.',
        icon: HiOutlineSquares2X2,
        id: 'workspace',
        label: 'Home',
        route: (org, brand) =>
          brand ? `/${org}/${brand}/workspace` : `/${org}/~/overview`,
      },
      {
        description: 'Chat and delegated work.',
        icon: HiOutlineChatBubbleLeftRight,
        id: 'agent',
        label: 'Agent',
        route: (org) => `/${org}/~/chat`,
      },
    ],
  },
  {
    id: 'content',
    label: 'Content',
    apps: [
      {
        activeIds: ['studio', 'compose', 'editor'],
        description: 'Generate and refine media.',
        icon: HiOutlineSparkles,
        id: 'studio',
        label: 'Create',
        route: (org, brand) =>
          brand ? `/${org}/${brand}/studio/image` : `/${org}/~/studio/image`,
      },
      {
        description: 'Assets and source material.',
        icon: HiOutlineFolder,
        id: 'library',
        label: 'Library',
        route: (org, brand) =>
          brand ? `/${org}/${brand}/library/ingredients` : `/${org}/~/library`,
      },
    ],
  },
  {
    id: 'distribution',
    label: 'Distribution',
    apps: [
      {
        description: 'Posts and scheduling.',
        icon: HiOutlinePaperAirplane,
        id: 'posts',
        label: 'Publish',
        route: (org, brand) =>
          brand ? `/${org}/${brand}/posts` : `/${org}/~/posts`,
      },
      {
        description: 'Workflows and batches.',
        icon: HiOutlineRectangleGroup,
        id: 'workflows',
        label: 'Automate',
        route: (org, brand) =>
          brand ? `/${org}/${brand}/workflows` : `/${org}/~/workflows`,
      },
      {
        description: 'Performance and trends.',
        icon: HiOutlineChartBarSquare,
        id: 'analytics',
        label: 'Analytics',
        route: (org, brand) =>
          brand
            ? `/${org}/${brand}/analytics/overview`
            : `/${org}/~/analytics/overview`,
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
  const activeApp = apps.find((app) => isActiveApp(app, currentApp));
  const ActiveIcon = activeApp?.icon ?? HiOutlineSquares2X2;
  const activeLabel = activeApp?.label ?? 'Home';

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
          {sections.map((section) => (
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
                    key={app.id}
                    app={app}
                    isActive={isActiveApp(app, currentApp)}
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
