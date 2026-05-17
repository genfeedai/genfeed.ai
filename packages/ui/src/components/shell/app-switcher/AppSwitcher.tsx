'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { AppSwitcherItemConfig } from '@genfeedai/interfaces';
import type { AppSwitcherProps } from '@genfeedai/props/ui/app-switcher.props';
import Link from 'next/link';
import {
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
      brand ? `/${org}/${brand}/library/ingredients` : `/${org}/~/overview`,
  },
  {
    icon: HiOutlineDocumentText,
    id: 'posts',
    label: 'Posts',
    route: (org, brand) =>
      brand ? `/${org}/${brand}/posts` : `/${org}/~/overview`,
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
      brand ? `/${org}/${brand}/studio/image` : `/${org}/~/overview`,
  },
  {
    icon: HiOutlineChartBar,
    id: 'workflows',
    label: 'Workflows',
    route: (org, brand) =>
      brand ? `/${org}/${brand}/workflows` : `/${org}/~/overview`,
  },
  {
    icon: HiOutlinePencilSquare,
    id: 'editor',
    label: 'Editor',
    route: (org, brand) =>
      brand ? `/${org}/${brand}/editor` : `/${org}/~/overview`,
  },
  {
    icon: HiOutlineRectangleGroup,
    id: 'compose',
    label: 'Write',
    route: (org, brand) =>
      brand ? `/${org}/${brand}/compose/post` : `/${org}/~/overview`,
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
}: {
  app: AppSwitcherItemConfig;
  isActive: boolean;
  href: string;
}) {
  const Icon = app.icon;

  return (
    <DropdownMenuItem asChild>
      <Link
        href={href}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'flex items-center gap-2.5 px-3 py-1.5 text-[13px]',
          isActive && 'bg-white/[0.06] font-medium',
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
}: AppSwitcherProps) {
  function getAppHref(app: AppSwitcherItemConfig) {
    return withPreservedSearch(app.route(orgSlug, brandSlug), preservedSearch);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant={ButtonVariant.GHOST}
          size={ButtonSize.ICON}
          className="size-7"
          ariaLabel="Switch app"
        >
          <TbGridDots className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={8} className="w-48">
        <DropdownMenuLabel>Content</DropdownMenuLabel>
        {CONTENT_APPS.map((app) => (
          <AppDropdownItem
            key={app.id}
            app={app}
            isActive={app.id === currentApp}
            href={getAppHref(app)}
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
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default AppSwitcher;
