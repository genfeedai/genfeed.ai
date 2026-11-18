import {
  CREATOR_PROFILE_TABS,
  type CreatorProfileTab,
  creatorProfilePath,
  creatorTabPath,
} from '@genfeedai/contracts/constants';
import type { CreatorTabsProps } from '@props/content/creator.props';
import { UnderlineNav } from '@ui/primitives/underline-nav';

const TAB_LABELS: Record<CreatorProfileTab, string> = {
  articles: 'Articles',
  images: 'Images',
  posts: 'Posts',
  videos: 'Videos',
};

/**
 * The profile's sections as plain links, so each one is its own crawlable
 * URL. A section with nothing in it is left out.
 */
export default function CreatorTabs({
  active,
  counts,
  handle,
}: CreatorTabsProps): React.ReactElement {
  const tabs = [
    { count: null, href: creatorProfilePath(handle), key: null, label: 'All' },
    ...CREATOR_PROFILE_TABS.filter((tab) => counts[tab] > 0).map((tab) => ({
      count: counts[tab],
      href: creatorTabPath(handle, tab),
      key: tab,
      label: TAB_LABELS[tab],
    })),
  ];

  return (
    <UnderlineNav
      ariaLabel="Profile sections"
      items={tabs.map((tab) => ({
        badge:
          tab.count === null ? null : (
            <span className="text-foreground/40">{tab.count}</span>
          ),
        href: tab.href,
        isActive: tab.key === active,
        label: tab.label,
      }))}
    />
  );
}
