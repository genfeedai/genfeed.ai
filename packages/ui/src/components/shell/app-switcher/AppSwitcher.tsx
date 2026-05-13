'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { AppSwitcherItemConfig } from '@genfeedai/interfaces';
import type { AppSwitcherProps } from '@genfeedai/props/ui/app-switcher.props';
import Link from 'next/link';
import {
  HiOutlineChartBarSquare,
  HiOutlineChatBubbleLeftRight,
  HiOutlineCog6Tooth,
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../../../primitives/popover';

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
    icon: HiOutlineCog6Tooth,
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

function AppGridItem({
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
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'group flex flex-col items-center gap-1.5 rounded-lg p-2.5 transition-colors',
        'hover:bg-white/[0.06]',
        isActive && 'bg-white/[0.08]',
      )}
    >
      <span
        className={cn(
          'flex size-10 items-center justify-center rounded-full transition-colors',
          isActive
            ? 'bg-white/[0.12] text-foreground'
            : 'bg-white/[0.04] text-foreground/60 group-hover:bg-white/[0.08] group-hover:text-foreground/80',
        )}
      >
        <Icon className="size-5" />
      </span>
      <span
        className={cn(
          'text-[11px] leading-tight',
          isActive
            ? 'font-medium text-foreground'
            : 'text-foreground/60 group-hover:text-foreground/80',
        )}
      >
        {app.label}
      </span>
    </Link>
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
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={ButtonVariant.GHOST}
          size={ButtonSize.ICON}
          className="size-7"
          ariaLabel="Switch app"
        >
          <TbGridDots className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={8} className="w-[264px] p-3">
        <div className="mb-2">
          <p className="px-1 text-[10px] font-bold uppercase tracking-[0.15em] text-foreground/30">
            Content
          </p>
        </div>
        <div className="grid grid-cols-3 gap-0.5">
          {CONTENT_APPS.map((app) => (
            <AppGridItem
              key={app.id}
              app={app}
              isActive={app.id === currentApp}
              href={getAppHref(app)}
            />
          ))}
        </div>

        <div className="my-2 border-t border-border" />

        <div className="mb-2">
          <p className="px-1 text-[10px] font-bold uppercase tracking-[0.15em] text-foreground/30">
            Tools
          </p>
        </div>
        <div className="grid grid-cols-3 gap-0.5">
          {PLATFORM_APPS.map((app) => (
            <AppGridItem
              key={app.id}
              app={app}
              isActive={app.id === currentApp}
              href={getAppHref(app)}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default AppSwitcher;
