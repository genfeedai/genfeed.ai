'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { AppSwitcherItemConfig } from '@genfeedai/interfaces';
import type { AppSwitcherProps } from '@genfeedai/props/ui/app-switcher.props';
import Link from 'next/link';
import { useRef } from 'react';
import {
  HiChevronDown,
  HiOutlineChartBar,
  HiOutlineChartBarSquare,
  HiOutlineChatBubbleLeftRight,
  HiOutlineDocumentText,
  HiOutlineFolder,
  HiOutlinePencilSquare,
  HiOutlineRectangleGroup,
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../../primitives/dropdown-menu';

const CONTENT_APPS: AppSwitcherItemConfig[] = [
  {
    icon: HiOutlineFolder,
    id: 'library',
    label: 'Library',
    route: (org, brand) =>
      brand ? `/${org}/${brand}/library/ingredients` : `/${org}/~/library`,
  },
  {
    icon: HiOutlineDocumentText,
    id: 'posts',
    label: 'Posts',
    route: (org, brand) =>
      brand ? `/${org}/${brand}/posts` : `/${org}/~/posts`,
  },
];

const PLATFORM_APPS: AppSwitcherItemConfig[] = [
  {
    icon: HiOutlineSquares2X2,
    id: 'workspace',
    label: 'Workspace',
    route: (org, brand) =>
      brand ? `/${org}/${brand}/workspace` : `/${org}/~/overview`,
  },
  {
    icon: HiOutlineChatBubbleLeftRight,
    id: 'agent',
    label: 'Agent',
    route: (org) => `/${org}/~/chat`,
  },
  {
    icon: HiOutlineSparkles,
    id: 'studio',
    label: 'Studio',
    route: (org, brand) =>
      brand ? `/${org}/${brand}/studio/image` : `/${org}/~/studio/image`,
  },
  {
    icon: HiOutlineChartBar,
    id: 'workflows',
    label: 'Workflows',
    route: (org, brand) =>
      brand ? `/${org}/${brand}/workflows` : `/${org}/~/workflows`,
  },
  {
    icon: HiOutlinePencilSquare,
    id: 'editor',
    label: 'Editor',
    route: (org, brand) =>
      brand ? `/${org}/${brand}/editor` : `/${org}/~/editor`,
  },
  {
    icon: HiOutlineRectangleGroup,
    id: 'compose',
    label: 'Write',
    route: (org, brand) =>
      brand ? `/${org}/${brand}/compose/post` : `/${org}/~/posts`,
  },
  {
    icon: HiOutlineChartBarSquare,
    id: 'analytics',
    label: 'Analytics',
    route: (org, brand) =>
      brand
        ? `/${org}/${brand}/analytics/overview`
        : `/${org}/~/analytics/overview`,
  },
];

const ALL_APPS: AppSwitcherItemConfig[] = [...PLATFORM_APPS, ...CONTENT_APPS];

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

function AppDropdownItem({
  app,
  isActive,
  href,
  onNavigateStart,
}: {
  app: AppSwitcherItemConfig;
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
          'flex items-center gap-2.5 px-3 py-1.5 text-[13px]',
          isActive && 'bg-foreground/[0.06] font-medium',
        )}
      >
        <Icon
          className={cn(
            'size-4 shrink-0',
            isActive ? 'text-foreground' : 'text-foreground/50',
          )}
        />
        <span
          className={cn(isActive ? 'text-foreground' : 'text-foreground/80')}
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

  const activeApp = ALL_APPS.find((app) => app.id === currentApp);
  const ActiveIcon = activeApp?.icon ?? HiOutlineSquares2X2;
  const activeLabel = activeApp?.label ?? 'Workspace';

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
            ariaLabel="Switch app"
          >
            <TbGridDots className="size-4" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-48"
        onCloseAutoFocus={(event) => {
          if (!preventTriggerAutoFocusRef.current) {
            return;
          }

          event.preventDefault();
          preventTriggerAutoFocusRef.current = false;
        }}
      >
        <DropdownMenuLabel>Content</DropdownMenuLabel>
        {CONTENT_APPS.map((app) => (
          <AppDropdownItem
            key={app.id}
            app={app}
            isActive={app.id === currentApp}
            href={getAppHref(app)}
            onNavigateStart={handleNavigateStart}
          />
        ))}

        <DropdownMenuSeparator />

        <DropdownMenuLabel>Tools</DropdownMenuLabel>
        {PLATFORM_APPS.map((app) => (
          <AppDropdownItem
            key={app.id}
            app={app}
            isActive={app.id === currentApp}
            href={getAppHref(app)}
            onNavigateStart={handleNavigateStart}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default AppSwitcher;
