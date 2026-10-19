'use client';

import type { FilterMenuFacet } from '@genfeedai/props/ui/forms/filter-menu.props';
import { getPlatformIcon } from '@helpers/ui/platform-icon/platform-icon.helper';
import type { DiscoveryDeskContentTypeFilter } from '@pages/trends/desk/desk-state';
import type {
  DiscoveryDeskItem,
  DiscoveryDeskSort,
} from '@props/trends/discovery-desk.props';
import type { TrendsSummary } from '@props/trends/trends-page.props';
import FilterMenu from '@ui/content/filter-menu/FilterMenu';
import { useTranslations } from 'next-intl';

const CONTENT_TYPE_OPTIONS: DiscoveryDeskContentTypeFilter[] = [
  'all',
  'video',
  'image',
  'post',
];

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
  items,
  summary,
  onContentTypeChange,
  onSort,
  sort,
}: {
  activePlatforms: Set<string>;
  onTogglePlatform: (platform: string) => void;
  onClearPlatforms: () => void;
  items: DiscoveryDeskItem[];
  summary: TrendsSummary;
  contentType: DiscoveryDeskContentTypeFilter;
  onContentTypeChange: (value: DiscoveryDeskContentTypeFilter) => void;
  onSort: (value: DiscoveryDeskSort) => void;
  sort: DiscoveryDeskSort;
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
      label={translate('filters.menu')}
      onClear={() => {
        onClearPlatforms();
        onContentTypeChange('all');
      }}
    />
  );
}
