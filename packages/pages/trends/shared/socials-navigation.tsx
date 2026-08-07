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

export type SocialsNavigationBasePath = '/discover' | '/analytics/trends';

interface SocialsNavigationItem {
  href: string;
  id: 'overview' | TrendPlatform;
  label: string;
  matchMode?: 'exact';
}

type IconComponent = ComponentType<{ className?: string }>;

/**
 * Brand-colored platform chips. Text tabs hid recognition and ate a full
 * row for 8 peers; a dropdown hides options. Same icon+color pattern as
 * PlatformSelector / PlatformBadge elsewhere.
 */
const PLATFORM_CHIP: Record<
  TrendPlatform,
  { Icon: IconComponent; iconClass: string; selectedClass: string }
> = {
  instagram: {
    Icon: InstagramIcon,
    iconClass: 'text-pink-500',
    selectedClass:
      'border-pink-500/40 bg-pink-500/15 text-pink-400 ring-1 ring-pink-500/25',
  },
  linkedin: {
    Icon: LinkedinIcon,
    iconClass: 'text-blue-600',
    selectedClass:
      'border-blue-600/40 bg-blue-600/15 text-blue-400 ring-1 ring-blue-600/25',
  },
  pinterest: {
    Icon: PinterestIcon,
    iconClass: 'text-red-600',
    selectedClass:
      'border-red-600/40 bg-red-600/15 text-red-400 ring-1 ring-red-600/25',
  },
  reddit: {
    Icon: RedditIcon,
    iconClass: 'text-orange-500',
    selectedClass:
      'border-orange-500/40 bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/25',
  },
  tiktok: {
    Icon: TiktokIcon,
    iconClass: 'text-foreground',
    selectedClass:
      'border-foreground/30 bg-foreground/10 text-foreground ring-1 ring-foreground/15',
  },
  twitter: {
    Icon: XTwitterIcon,
    iconClass: 'text-foreground',
    selectedClass:
      'border-foreground/30 bg-foreground/10 text-foreground ring-1 ring-foreground/15',
  },
  youtube: {
    Icon: YoutubeIcon,
    iconClass: 'text-red-500',
    selectedClass:
      'border-red-500/40 bg-red-500/15 text-red-400 ring-1 ring-red-500/25',
  },
};

/**
 * Socials surface filter: Overview + per-platform feeds.
 * Brand Following is a Discover sidebar peer (`/discover/following`), not a
 * Socials sub-control — keep this strip free of ops/source-management chrome.
 */
const PLATFORM_LABELS: Array<{
  id: 'overview' | TrendPlatform;
  label: string;
  matchMode?: 'exact';
}> = [
  { id: 'overview', label: 'Overview', matchMode: 'exact' },
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
    : '/discover/socials';
}

function buildPlatformHref(
  basePath: SocialsNavigationBasePath,
  platform: TrendPlatform,
): string {
  return basePath === '/analytics/trends'
    ? `/analytics/trends/platforms/${platform}`
    : `/discover/${platform}`;
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

function SocialsNavChip({
  children,
  className,
  href,
  isActive,
  label,
}: {
  children: ReactNode;
  className?: string;
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
      onFocus={prefetchHref}
      onMouseEnter={prefetchHref}
      title={label}
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        isActive
          ? className
          : 'border-border/60 bg-background/40 text-foreground/55 hover:border-border hover:bg-foreground/[0.04] hover:text-foreground/80',
      )}
    >
      {children}
    </Link>
  );
}

export function SocialsNavigation({
  active,
  basePath = '/discover',
}: {
  active: SocialsNavigationValue;
  basePath?: SocialsNavigationBasePath;
}) {
  const items = buildSocialsNavItems(basePath);

  return (
    <nav
      aria-label="Social platforms"
      className="flex max-w-full flex-wrap items-center gap-1.5"
      data-testid="socials-platform-filter"
    >
      {items.map((item) => {
        const isActive = item.id === active;

        if (item.id === 'overview') {
          return (
            <SocialsNavChip
              key={item.id}
              href={item.href}
              isActive={isActive}
              label={item.label}
              className={
                isActive
                  ? 'border-foreground/25 bg-foreground/10 text-foreground ring-1 ring-foreground/10'
                  : undefined
              }
            >
              <LayoutGrid
                aria-hidden="true"
                className={cn(
                  'size-3.5',
                  isActive ? 'text-foreground' : 'text-foreground/50',
                )}
              />
              <span>{item.label}</span>
            </SocialsNavChip>
          );
        }

        const chip = PLATFORM_CHIP[item.id];
        const Icon = chip.Icon;

        return (
          <SocialsNavChip
            key={item.id}
            href={item.href}
            isActive={isActive}
            label={item.label}
            className={isActive ? chip.selectedClass : undefined}
          >
            <Icon
              aria-hidden="true"
              className={cn(
                'size-3.5',
                chip.iconClass,
                !isActive && 'opacity-70',
              )}
            />
            {/* Label only when selected — keeps the strip compact like a filter. */}
            {isActive ? (
              <span className="max-w-[7rem] truncate">{item.label}</span>
            ) : null}
          </SocialsNavChip>
        );
      })}
    </nav>
  );
}
