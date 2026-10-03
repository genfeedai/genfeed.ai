'use client';

import type { IconComponent } from '@genfeedai/contracts/types/icon';
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

const TRENDS_BASE_PATH = '/discovery/trends';

interface SocialsNavigationItem {
  href: string;
  id: 'overview' | TrendPlatform;
  label: string;
  matchMode?: 'exact';
}

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
 * Local surface switcher between Discovery › Trends and its per-platform
 * drilldowns (`/discovery/trends/platforms/:platform`).
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

function buildSocialsNavItems(): SocialsNavigationItem[] {
  return PLATFORM_LABELS.map(({ id, label, matchMode }) => {
    const item: SocialsNavigationItem = {
      href:
        id === 'overview'
          ? TRENDS_BASE_PATH
          : `${TRENDS_BASE_PATH}/platforms/${id}`,
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
}: {
  active: SocialsNavigationValue;
}) {
  const items = buildSocialsNavItems();

  return (
    <Tabs
      activeTab={active}
      ariaLabel="Social platforms"
      className="max-w-full"
      fullWidth={false}
      testId="socials-platform-filter"
      items={items.map((item) => ({
        ...item,
        icon: item.id === 'overview' ? LayoutGrid : PLATFORM_ICONS[item.id],
      }))}
    />
  );
}
