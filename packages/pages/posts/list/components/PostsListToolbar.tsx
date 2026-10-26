'use client';

import { ComponentSize, PostStatus } from '@genfeedai/contracts';
import type { FilterMenuFacet } from '@genfeedai/props/ui/forms/filter-menu.props';
import { getPostPlatformTabs } from '@helpers/content/posts.helper';
import {
  POSTS_SOURCE_EXTENSION,
  type PostsSourceFilter,
  type PublishingPostsView,
  parsePostsSource,
} from '@pages/posts/list/posts-list-query';
import FilterMenu from '@ui/content/filter-menu/FilterMenu';
import FormSearchbar from '@ui/primitives/searchbar';
import { useTranslations } from 'next-intl';

export interface PostsListToolbarOption {
  label: string;
  value: string;
}

const PUBLISHING_VIEW_OPTIONS: {
  messageKey: 'failed' | 'notPosted' | 'pending' | 'posted' | 'publishing';
  value: PublishingPostsView;
}[] = [
  { messageKey: 'notPosted', value: 'not-posted' },
  { messageKey: 'pending', value: PostStatus.PENDING },
  { messageKey: 'publishing', value: PostStatus.PROCESSING },
  { messageKey: 'posted', value: 'posted' },
  { messageKey: 'failed', value: PostStatus.FAILED },
];

export interface PostsListToolbarProps {
  sortValue: string;
  sortOptions: PostsListToolbarOption[];
  onSortChange: (value: string) => void;
  /** A platform id, or `all`; with `onPlatformChange` it adds the Platform facet. */
  platformValue?: string;
  onPlatformChange?: (value: string) => void;
  onPublishingViewChange?: (value: PublishingPostsView) => void;
  onSourceChange?: (value: PostsSourceFilter | undefined) => void;
  publishingView?: PublishingPostsView;
  sourceValue?: PostsSourceFilter;
}

export interface PostsListSearchProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
}

/** Rests as an icon, like the Library search. */
export function PostsListSearch({
  searchValue,
  onSearchChange,
}: PostsListSearchProps) {
  const translate = useTranslations('pages.posts.list');
  return (
    <FormSearchbar
      isCollapsible
      onSearch={onSearchChange}
      placeholder={translate('toolbar.searchPlaceholder')}
      // SM keeps the control on the same 32px shell row as ViewToggle + refresh.
      size={ComponentSize.SM}
      value={searchValue}
    />
  );
}

/** Publishing state, source and sort behind the shared Filters menu. */
export default function PostsListToolbar({
  sortValue,
  sortOptions,
  onSortChange,
  onPlatformChange,
  onPublishingViewChange,
  onSourceChange,
  platformValue,
  publishingView,
  sourceValue,
}: PostsListToolbarProps) {
  const translate = useTranslations('pages.posts.list');
  const translateAdmin = useTranslations('pages.posts.list.admin');
  const translateMenu = useTranslations('ui.filtersButton');

  const facets: FilterMenuFacet[] = [];

  if (publishingView && onPublishingViewChange) {
    facets.push({
      // A list always shows one publishing state, so it picks a view rather
      // than narrowing: it never lights the active-filter badge.
      isCounted: false,
      key: 'publishing-state',
      label: translate('toolbar.publishingStateAria'),
      onChange: (value) => onPublishingViewChange(value as PublishingPostsView),
      options: PUBLISHING_VIEW_OPTIONS.map((option) => ({
        label: translate(`toolbar.${option.messageKey}`),
        value: option.value,
      })),
      selection: 'single',
      value: publishingView,
    });
  }

  if (onPlatformChange) {
    facets.push({
      defaultValue: 'all',
      key: 'platform',
      label: translateAdmin('platformFilter'),
      onChange: onPlatformChange,
      options: getPostPlatformTabs().map(({ icon: Icon, id, label }) => ({
        icon: Icon ? <Icon aria-hidden="true" className="size-4" /> : undefined,
        label: id === 'all' ? translateMenu('all') : label,
        value: id,
        isLiteral: id !== 'all',
      })),
      selection: 'single',
      value: platformValue ?? 'all',
    });
  }

  if (onSourceChange) {
    facets.push({
      defaultValue: 'all',
      key: 'source',
      label: translate('toolbar.sourceAria'),
      onChange: (value) => onSourceChange(parsePostsSource(value)),
      options: [
        { label: translateMenu('all'), value: 'all' },
        {
          label: translate('toolbar.sourceExtension'),
          value: POSTS_SOURCE_EXTENSION,
        },
      ],
      selection: 'single',
      value: sourceValue ?? 'all',
    });
  }

  facets.push({
    isCounted: false,
    key: 'sort',
    label: translate('toolbar.sortAria'),
    onChange: onSortChange,
    options: sortOptions,
    selection: 'single',
    value: sortValue,
  });

  return (
    <FilterMenu
      allLabel={translateMenu('all')}
      clearLabel={translateMenu('clear')}
      facets={facets}
      getActiveCountLabel={(count) => translateMenu('activeCount', { count })}
      label={translateMenu('menu')}
      onClear={() => {
        onSourceChange?.(undefined);
        onPlatformChange?.('all');
      }}
    />
  );
}
