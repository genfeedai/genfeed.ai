'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import {
  InstagramIcon,
  LinkedinIcon,
  PinterestIcon,
  RedditIcon,
  TiktokIcon,
  XTwitterIcon,
  YoutubeIcon,
} from '@genfeedai/helpers/ui/icons/brands';
import type { TrendPlatform } from '@pages/trends/shared/trends-platforms';
import { useNavigationPrefetch } from '@ui/navigation/prefetch/useNavigationPrefetch';
import { LayoutGrid } from 'lucide-react';
import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';

export type SocialsNavigationBasePath = '/discovery' | '/analytics/trends';

interface SocialsNavigationItem {
  href: string;
  id: 'overview' | TrendPlatform;
  label: string;
  matchMode?: 'exact';
}

type IconComponent = ComponentType<{ className?: string }>;

const PLATFORM_ICONS: Record<
  TrendPlatform,
  { Icon: IconComponent; iconClass: string }
> = {
  instagram: { Icon: InstagramIcon, iconClass: 'text-pink-500' },
  linkedin: { Icon: LinkedinIcon, iconClass: 'text-blue-600' },
  pinterest: { Icon: PinterestIcon, iconClass: 'text-red-600' },
  reddit: { Icon: RedditIcon, iconClass: 'text-orange-500' },
  tiktok: { Icon: TiktokIcon, iconClass: 'text-foreground' },
  twitter: { Icon: XTwitterIcon, iconClass: 'text-foreground' },
  youtube: { Icon: YoutubeIcon, iconClass: 'text-red-500' },
};

/**
 * Local surface switcher for analytics/trends (and any host still using a
 * section topbar). Platform destinations in Discovery live in the **sidebar
 * menu** — not as rounded pills.
 */
const PLATFORM_LABELS: Array<{
  id: 'overview' | TrendPlatform;
  label: string;
  matchMode?: 'exact';
}> = [
  { id: 'overview', label: 'All platforms', matchMode: 'exact' },
  { id: 'twitter', label: 'X' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'reddit', label: 'Reddit' },
  { id: 'pinterest', label: 'Pinterest' },
];

function buildOverviewHref(basePath: SocialsNavigationBasePath): string {
  return basePath === '/analytics/trends'
    ? '/analytics/trends'
    : '/discovery/overview';
}

function buildPlatformHref(
  basePath: SocialsNavigationBasePath,
  platform: TrendPlatform,
): string {
  return basePath === '/analytics/trends'
    ? `/analytics/trends/platforms/${platform}`
    : `/discovery/${platform}`;
}

function buildSocialsNavItems(
  basePath: SocialsNavigationBasePath,
): SocialsNavigationItem[] {
  return PLATFORM_LABELS.map(({ id, label, matchMode }) => {
    const item: SocialsNavigationItem = {
      href:
        id === 'overview'
          ? buildOverviewHref(basePath)
          : buildPlatformHref(basePath, id),
      id,
      label,
    };
    if (matchMode) {
      item.matchMode = matchMode;
    }
    return item;
  });
}

export type SocialsNavigationValue = 'overview' | TrendPlatform;

/**
 * Menu-row local nav: icon + label, underline active state — not filter pills.
 * Prefer Discovery sidebar menu items for platform destinations; keep this for
 * analytics/trends section chrome and tests.
 */
function SocialsNavItem({
  children,
  href,
  isActive,
  label,
}: {
  children: ReactNode;
  href: string;
  isActive: boolean;
  label: string;
}) {
  const prefetchHref = useNavigationPrefetch(href);

  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      aria-label={label}
      data-state={isActive ? 'active' : 'inactive'}
      prefetch={false}
      onFocus={prefetchHref}
      onMouseEnter={prefetchHref}
      title={label}
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-1.5 border-b-2 px-2.5 text-xs font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        isActive
          ? 'border-foreground text-foreground'
          : 'border-transparent text-foreground/55 hover:border-border hover:text-foreground/85',
      )}
    >
      {children}
    </Link>
  );
}

export function SocialsNavigation({
  active,
  basePath = '/discovery',
}: {
  active: SocialsNavigationValue;
  basePath?: SocialsNavigationBasePath;
}) {
  const items = buildSocialsNavItems(basePath);

  return (
    <nav
      aria-label="Social platforms"
      className="flex max-w-full flex-wrap items-center gap-0.5"
      data-testid="socials-platform-filter"
    >
      {items.map((item) => {
        const isActive = item.id === active;

        if (item.id === 'overview') {
          return (
            <SocialsNavItem
              key={item.id}
              href={item.href}
              isActive={isActive}
              label={item.label}
            >
              <LayoutGrid
                aria-hidden="true"
                className={cn(
                  'size-3.5',
                  isActive ? 'text-foreground' : 'text-foreground/50',
                )}
              />
              <span>{item.label}</span>
            </SocialsNavItem>
          );
        }

        const platform = PLATFORM_ICONS[item.id];
        const Icon = platform.Icon;

        return (
          <SocialsNavItem
            key={item.id}
            href={item.href}
            isActive={isActive}
            label={item.label}
          >
            <Icon
              aria-hidden="true"
              className={cn(
                'size-3.5',
                platform.iconClass,
                !isActive && 'opacity-70',
              )}
            />
            <span className="max-w-[7rem] truncate">{item.label}</span>
          </SocialsNavItem>
        );
      })}
    </nav>
  );
}
