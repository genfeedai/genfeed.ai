'use client';

import { PostStatus } from '@genfeedai/contracts';
import type { FilterMenuFacet } from '@genfeedai/props/ui/forms/filter-menu.props';
import { getPostPlatformTabs } from '@helpers/content/posts.helper';
import FilterMenu from '@ui/content/filter-menu/FilterMenu';
import SearchField from '@ui/content/search-field/SearchField';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import {
  POSTS_SOURCE_EXTENSION,
  type PostsSourceFilter,
  type PublishingPostsView,
  parsePostsSource,
} from '@/features/posts/list/posts-list-query';

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
  /** Sits inside a `SearchField`'s trailing edge: a compact trigger. */
  isAttached?: boolean;
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
  /** The Filters menu, attached inside the field. */
  children?: ReactNode;
  searchValue: string;
  onSearchChange: (value: string) => void;
}

/** The posts search, with the Filters menu attached inside it. */
export function PostsListSearch({
  children,
  searchValue,
  onSearchChange,
}: PostsListSearchProps) {
  const translate = useTranslations('pages.posts.list');
  return (
    <SearchField
      onSearch={onSearchChange}
      placeholder={translate('toolbar.searchPlaceholder')}
      value={searchValue}
    >
      {children}
    </SearchField>
  );
}

/** Publishing state, source and sort behind the shared Filters menu. */
export default function PostsListToolbar({
  isAttached,
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
      facets={facets}
      isAttached={isAttached}
      onClear={() => {
        onSourceChange?.(undefined);
        onPlatformChange?.('all');
      }}
    />
  );
}
