'use client';

import type { TrendPlatform } from '@pages/trends/shared/trends-platforms';
import Tabs from '@ui/navigation/tabs/Tabs';

export type SocialsNavigationBasePath = '/research' | '/analytics/trends';

interface SocialsNavigationItem {
  href: string;
  id: 'overview' | 'following' | TrendPlatform;
  label: string;
  matchMode?: 'exact';
}

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
    : '/research/socials';
}

function buildPlatformHref(
  basePath: SocialsNavigationBasePath,
  platform: TrendPlatform,
): string {
  return basePath === '/analytics/trends'
    ? `/analytics/trends/platforms/${platform}`
    : `/research/${platform}`;
}

function buildSocialsNavItems(
  basePath: SocialsNavigationBasePath,
): SocialsNavigationItem[] {
  const platformItems = PLATFORM_LABELS.map(({ id, label, matchMode }) => {
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

  if (basePath !== '/research') {
    return platformItems;
  }

  return [
    platformItems[0],
    { href: '/research/following', id: 'following', label: 'Following' },
    ...platformItems.slice(1),
  ];
}

export type SocialsNavigationValue = 'overview' | 'following' | TrendPlatform;

export function SocialsNavigation({
  active,
  basePath = '/research',
}: {
  active: SocialsNavigationValue;
  basePath?: SocialsNavigationBasePath;
}) {
  const items = buildSocialsNavItems(basePath);
  return (
    <Tabs
      items={items}
      activeTab={active}
      fullWidth={false}
      variant="default"
    />
  );
}
