'use client';

import type { TrendPlatform } from '@pages/trends/shared/trends-platforms';
import Tabs from '@ui/navigation/tabs/Tabs';

export const SOCIALS_NAV_ITEMS = [
  {
    href: '/research/socials',
    id: 'overview',
    label: 'Overview',
    matchMode: 'exact' as const,
  },
  { href: '/research/twitter', id: 'twitter', label: 'X' },
  {
    href: '/research/instagram',
    id: 'instagram',
    label: 'Instagram',
  },
  { href: '/research/youtube', id: 'youtube', label: 'YouTube' },
  { href: '/research/tiktok', id: 'tiktok', label: 'TikTok' },
  { href: '/research/linkedin', id: 'linkedin', label: 'LinkedIn' },
  { href: '/research/reddit', id: 'reddit', label: 'Reddit' },
  {
    href: '/research/pinterest',
    id: 'pinterest',
    label: 'Pinterest',
  },
] as const;

export const PLATFORM_DROPDOWN_OPTIONS = SOCIALS_NAV_ITEMS.map((item) => ({
  label: item.id === 'overview' ? 'All Platforms' : item.label,
  value: item.id,
}));

export type SocialsNavigationValue = 'overview' | TrendPlatform;

export function SocialsNavigation({
  active,
}: {
  active: SocialsNavigationValue;
}) {
  return (
    <Tabs
      items={
        SOCIALS_NAV_ITEMS as unknown as Array<
          (typeof SOCIALS_NAV_ITEMS)[number]
        >
      }
      activeTab={active}
      fullWidth={false}
      variant="default"
    />
  );
}
