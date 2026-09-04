'use client';

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
import Tabs from '@ui/navigation/tabs/Tabs';
import { LayoutGrid } from 'lucide-react';
import type { ComponentType } from 'react';

export type SocialsNavigationBasePath = '/discovery' | '/analytics/trends';

interface SocialsNavigationItem {
  href: string;
  id: 'overview' | TrendPlatform;
  label: string;
  matchMode?: 'exact';
}

type IconComponent = ComponentType<{ className?: string }>;

const PLATFORM_ICONS: Record<TrendPlatform, IconComponent> = {
  instagram: InstagramIcon,
  linkedin: LinkedinIcon,
  pinterest: PinterestIcon,
  reddit: RedditIcon,
  tiktok: TiktokIcon,
  twitter: XTwitterIcon,
  youtube: YoutubeIcon,
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

export function SocialsNavigation({
  active,
  basePath = '/discovery',
}: {
  active: SocialsNavigationValue;
  basePath?: SocialsNavigationBasePath;
}) {
  const items = buildSocialsNavItems(basePath);

  return (
    <Tabs
      activeTab={active}
      ariaLabel="Social platforms"
      className="max-w-full"
      fullWidth={false}
      items={items.map((item) => ({
        ...item,
        icon: item.id === 'overview' ? LayoutGrid : PLATFORM_ICONS[item.id],
      }))}
    />
  );
}
