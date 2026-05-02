'use client';

import { ButtonVariant } from '@genfeedai/enums';
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
import { Button } from '../../../primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../../primitives/dropdown-menu';
import { SimpleTooltip } from '../../../primitives/tooltip';

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
    route: (org) => `/${org}/~/overview`,
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
    route: (org) => `/${org}/~/workflows`,
  },
  {
    icon: HiOutlinePencilSquare,
    id: 'editor',
    label: 'Editor',
    route: (org) => `/${org}/~/editor`,
  },
  {
    icon: HiOutlineRectangleGroup,
    id: 'compose',
    label: 'Compose',
    route: (org) => `/${org}/~/compose/post`,
  },
  {
    icon: HiOutlineChartBarSquare,
    id: 'analytics',
    label: 'Analytics',
    route: (org) => `/${org}/~/analytics/overview`,
  },
];

const ALL_APPS = [...CONTENT_APPS, ...PLATFORM_APPS];

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

export function AppSwitcher({
  brandSlug,
  currentApp,
  orgSlug,
  preservedSearch,
}: AppSwitcherProps) {
  const activeApp = ALL_APPS.find((app) => app.id === currentApp);
  const ActiveIcon = activeApp?.icon ?? HiOutlineSquares2X2;

  function getAppHref(app: AppSwitcherItemConfig) {
    return withPreservedSearch(app.route(orgSlug, brandSlug), preservedSearch);
  }

  return (
    <DropdownMenu>
      <SimpleTooltip label={activeApp?.label ?? 'Switch app'} position="bottom">
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
            className="inline-flex h-7 w-7 items-center justify-center rounded border border-border bg-background-secondary transition-colors hover:border-border-strong hover:bg-background-tertiary"
            ariaLabel={`Current app: ${activeApp?.label ?? currentApp}. Click to switch apps.`}
          >
            <ActiveIcon className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
      </SimpleTooltip>
      <DropdownMenuContent align="end" sideOffset={8} className="min-w-0">
        {CONTENT_APPS.map((app) => {
          const Icon = app.icon;
          const isActive = app.id === currentApp;

          return (
            <SimpleTooltip key={app.id} label={app.label} position="left">
              <DropdownMenuItem
                asChild
                className={cn(
                  'flex items-center justify-center px-3 py-2',
                  isActive && 'bg-hover',
                )}
              >
                <Link
                  href={getAppHref(app)}
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={app.label}
                  data-active={isActive ? 'true' : undefined}
                >
                  <Icon
                    aria-hidden="true"
                    className={cn(
                      'h-4 w-4',
                      isActive ? 'text-foreground' : 'text-foreground/55',
                    )}
                  />
                  <span className="sr-only">{app.label}</span>
                </Link>
              </DropdownMenuItem>
            </SimpleTooltip>
          );
        })}

        <DropdownMenuSeparator />

        {PLATFORM_APPS.map((app) => {
          const Icon = app.icon;
          const isActive = app.id === currentApp;

          return (
            <SimpleTooltip key={app.id} label={app.label} position="left">
              <DropdownMenuItem
                asChild
                className={cn(
                  'flex items-center justify-center px-3 py-2',
                  isActive && 'bg-hover',
                )}
              >
                <Link
                  href={getAppHref(app)}
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={app.label}
                  data-active={isActive ? 'true' : undefined}
                >
                  <Icon
                    aria-hidden="true"
                    className={cn(
                      'h-4 w-4',
                      isActive ? 'text-foreground' : 'text-foreground/55',
                    )}
                  />
                  <span className="sr-only">{app.label}</span>
                </Link>
              </DropdownMenuItem>
            </SimpleTooltip>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default AppSwitcher;
