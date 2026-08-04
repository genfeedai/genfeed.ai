'use client';

import type { TrendPlatform } from '@pages/trends/shared/trends-platforms';
import Tabs from '@ui/navigation/tabs/Tabs';

export type SocialsNavigationBasePath = '/discover' | '/analytics/trends';

interface SocialsNavigationItem {
  href: string;
  id: 'overview' | TrendPlatform;
  label: string;
  matchMode?: 'exact';
}

/**
 * Socials surface tabs only: Overview + per-platform feeds.
 * Brand Following is a Discover sidebar peer (`/discover/following`), not a
 * Socials sub-tab — keep this strip free of ops/source-management chrome.
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

export function SocialsNavigation({
  active,
  basePath = '/discover',
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
