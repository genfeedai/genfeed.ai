import {
  CREATOR_PROFILE_TABS,
  type CreatorProfileTab,
  creatorProfilePath,
  creatorTabPath,
} from '@genfeedai/contracts/constants';
import { cn } from '@helpers/formatting/cn/cn.util';
import type { CreatorTabsProps } from '@props/content/creator.props';
import Link from 'next/link';

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
    <nav
      aria-label="Profile sections"
      className="flex gap-6 overflow-x-auto border-b border-foreground/10"
    >
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Link
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              '-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 pb-3 text-sm transition-colors',
              isActive
                ? 'border-foreground text-foreground'
                : 'border-transparent text-foreground/60 hover:text-foreground',
            )}
            href={tab.href}
            key={tab.label}
          >
            {tab.label}
            {tab.count === null ? null : (
              <>
                {' '}
                <span className="text-foreground/40">{tab.count}</span>
              </>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
