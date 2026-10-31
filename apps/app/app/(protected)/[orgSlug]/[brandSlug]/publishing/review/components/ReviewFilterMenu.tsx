import type { FilterMenuFacet } from '@genfeedai/props/ui/forms/filter-menu.props';
import { useTranslations } from 'next-intl';
import FilterMenu from '@/components/content/filter-menu/FilterMenu';
import type { ReviewFilterMenuProps } from '@/features/posts/props/review-filter-menu.props';
import type { ReviewStatusFilter } from './review-grid.helpers';
import { REVIEW_STATUS_FILTER_VALUES } from './review-grid.helpers';
import {
  REVIEW_INBOX_SOURCE_MESSAGE_KEYS,
  REVIEW_INBOX_SOURCES,
} from './review-inbox.helpers';

/**
 * Source (who is asking), status and batch behind the one Filters menu in the
 * publishing subbar. An empty source or status selection means "all".
 */
export default function ReviewFilterMenu({
  activeFilters,
  activeSources,
  activeTurboRunId,
  hasTurboControls,
  filterCounts,
  turboRunOptions,
  onFilterChange,
  onSourceChange,
  onTurboRunChange,
}: ReviewFilterMenuProps) {
  const translate = useTranslations('pages.publishing.review');
  const translateInbox = useTranslations('pages.publishing.review.inbox');

  const facets: FilterMenuFacet[] = [
    {
      key: 'source',
      label: translateInbox('sourceLabel'),
      onChange: (values) =>
        onSourceChange(
          REVIEW_INBOX_SOURCES.filter((source) => values.includes(source)),
        ),
      options: REVIEW_INBOX_SOURCES.map((source) => ({
        label: translateInbox(REVIEW_INBOX_SOURCE_MESSAGE_KEYS[source]),
        value: source,
      })),
      selection: 'multiple',
      values: activeSources,
    },
  ];

  if (hasTurboControls) {
    facets.push(
      {
        key: 'status',
        label: translate('filters.label'),
        onChange: (values) => onFilterChange(values as ReviewStatusFilter[]),
        options: REVIEW_STATUS_FILTER_VALUES.map((filter) => ({
          count: filterCounts[filter],
          label: translate(`filters.status.${filter}`),
          value: filter,
        })),
        selection: 'multiple',
        values: activeFilters,
      },
      {
        // A batch is always picked, so it chooses a view instead of narrowing.
        isCounted: false,
        key: 'batch',
        label: translate('queue.batchLabel'),
        onChange: onTurboRunChange,
        options: turboRunOptions.map((option) => ({
          ...option,
          isLiteral: true,
        })),
        selection: 'single',
        value: activeTurboRunId ?? '',
      },
    );
  }

  return (
    <FilterMenu
      facets={facets}
      onClear={() => {
        onSourceChange([]);
        onFilterChange([]);
      }}
    />
  );
}
