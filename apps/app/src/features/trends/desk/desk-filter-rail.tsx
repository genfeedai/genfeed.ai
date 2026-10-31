'use client';

import type { FilterMenuFacet } from '@genfeedai/props/ui/forms/filter-menu.props';
import { getPlatformIcon } from '@helpers/ui/platform-icon/platform-icon.helper';
import type { TrendsSummary } from '@props/trends/trends-page.props';
import { useTranslations } from 'next-intl';
import FilterMenu from '@/components/content/filter-menu/FilterMenu';
import type { DiscoveryDeskContentTypeFilter } from '@/features/trends/desk/desk-state';
import type {
  DiscoveryDeskItem,
  DiscoveryDeskSort,
} from '@/features/trends/props/discovery-desk.props';

const CONTENT_TYPE_OPTIONS: DiscoveryDeskContentTypeFilter[] = [
  'all',
  'video',
  'image',
  'post',
];

/** Where a signal comes from. `following` opens the Following deck. */
const SOURCE_OPTIONS = ['trends', 'owned', 'imported', 'following'] as const;

const SORT_OPTIONS: DiscoveryDeskSort[] = [
  'velocity',
  'virality',
  'recency',
  'engagement',
];

export default function DeskFilterRail({
  contentType,
  activePlatforms,
  onTogglePlatform,
  onClearPlatforms,
  isAttached,
  items,
  summary,
  onContentTypeChange,
  onSort,
  onSourceChange,
  sort,
  source,
}: {
  activePlatforms: Set<string>;
  onTogglePlatform: (platform: string) => void;
  onClearPlatforms: () => void;
  /** Sits inside a `SearchField`'s trailing edge: a compact trigger. */
  isAttached?: boolean;
  items: DiscoveryDeskItem[];
  summary: TrendsSummary;
  contentType: DiscoveryDeskContentTypeFilter;
  onContentTypeChange: (value: DiscoveryDeskContentTypeFilter) => void;
  onSort: (value: DiscoveryDeskSort) => void;
  onSourceChange: (value: string) => void;
  sort: DiscoveryDeskSort;
  source: string;
}) {
  const translate = useTranslations('common.trends.desk');
  const platforms = Array.from(
    new Set([
      ...summary.connectedPlatforms,
      ...summary.lockedPlatforms,
      ...items.map((item) => item.platform),
    ]),
  ).sort();
  const facets: FilterMenuFacet[] = [
    {
      defaultValue: 'all',
      key: 'source',
      label: translate('filters.source'),
      onChange: onSourceChange,
      options: [
        {
          count: items.length,
          label: translate('sourceTabs.all'),
          value: 'all',
        },
        ...SOURCE_OPTIONS.map((option) => ({
          count: items.filter((item) => item.source === option).length,
          label: translate(
            option === 'following' ? 'following.title' : `sourceTabs.${option}`,
          ),
          value: option,
        })),
      ],
      selection: 'single',
      value: source,
    },
    {
      key: 'platforms',
      label: translate('filters.platforms'),
      // The menu reports the new set; the owner toggles one platform per click.
      onChange: (values) => {
        const changed = platforms.find(
          (platform) =>
            values.includes(platform) !== activePlatforms.has(platform),
        );
        if (changed) {
          onTogglePlatform(changed);
        }
      },
      options: platforms.map((platform) => ({
        icon: getPlatformIcon(platform, 'size-4'),
        label: `${platform} (${items.filter((item) => item.platform === platform).length})`,
        value: platform,
      })),
      selection: 'multiple',
      values: Array.from(activePlatforms),
    },
    {
      defaultValue: 'all',
      key: 'content-type',
      label: translate('filters.contentType'),
      onChange: (value) =>
        onContentTypeChange(value as DiscoveryDeskContentTypeFilter),
      options: CONTENT_TYPE_OPTIONS.map((option) => ({
        label: translate(`filters.types.${option}`),
        value: option,
      })),
      selection: 'single',
      value: contentType,
    },
    {
      isCounted: false,
      key: 'sort',
      label: translate('filters.sort'),
      onChange: (value) => onSort(value as DiscoveryDeskSort),
      options: SORT_OPTIONS.map((option) => ({
        label: translate(`filters.sortOptions.${option}`),
        value: option,
      })),
      selection: 'single',
      value: sort,
    },
  ];

  return (
    <FilterMenu
      align="start"
      allLabel={translate('filters.all')}
      clearLabel={translate('filters.clear')}
      facets={facets}
      getActiveCountLabel={(count) =>
        translate('filters.activeCount', { count })
      }
      isAttached={isAttached}
      label={translate('filters.menu')}
      onClear={() => {
        onClearPlatforms();
        onContentTypeChange('all');
        onSourceChange('all');
      }}
    />
  );
}
