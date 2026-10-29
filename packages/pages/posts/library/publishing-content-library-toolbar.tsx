'use client';

import { ComponentSize } from '@genfeedai/contracts';
import type { FilterMenuFacet } from '@genfeedai/props/ui/forms/filter-menu.props';
import { getPlatformIcon } from '@helpers/ui/platform-icon/platform-icon.helper';
import type {
  PublishingContentLibraryItem,
  PublishingContentTypeFilter,
} from '@pages/posts/library/publishing-content-library.helpers';
import {
  formatPublishingContentStatus,
  PUBLISHING_CONTENT_TYPES,
} from '@pages/posts/library/publishing-content-library.helpers';
import {
  POSTS_SOURCE_EXTENSION,
  type PostsSourceFilter,
  parsePostsSource,
} from '@pages/posts/list/posts-list-query';
import type { PublishingContentAccount } from '@props/posts/publishing-content-entry.props';
import FilterMenu from '@ui/content/filter-menu/FilterMenu';
import SearchField from '@ui/content/search-field/SearchField';
import { Globe, Mail, Share2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

interface FilterOption {
  label: string;
  value: string;
}

const CHANNEL_ACCOUNT_PREFIX = 'account:';
const FACET_ALL = 'all';

export interface PublishingContentLibraryToolbarProps {
  accountOptions: PublishingContentAccount[];
  channelOptions: FilterOption[];
  channelValue: string;
  /** Sits inside a `SearchField`'s trailing edge: a compact trigger. */
  isAttached?: boolean;
  /** Unfiltered rows; the facets show how many results sit behind each option. */
  items: readonly PublishingContentLibraryItem[];
  sourceValue?: PostsSourceFilter;
  statusOptions: FilterOption[];
  statusValue: string[];
  typeValue: PublishingContentTypeFilter;
  onChannelChange: (value: string) => void;
  onClear: () => void;
  onSourceChange: (value: PostsSourceFilter | undefined) => void;
  onStatusChange: (value: string[]) => void;
  onTypeChange: (value: PublishingContentTypeFilter) => void;
}

export interface PublishingContentLibrarySearchProps {
  /** The Filters menu, attached inside the field. */
  children?: ReactNode;
  searchValue: string;
  onSearchChange: (value: string) => void;
}

/** The content search, with the Filters menu attached inside it. */
export function PublishingContentLibrarySearch({
  children,
  searchValue,
  onSearchChange,
}: PublishingContentLibrarySearchProps) {
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

function renderChannelIcon(channel: string): ReactNode {
  return (
    getPlatformIcon(channel, 'size-4') ??
    (channel === 'email' ? (
      <Mail aria-hidden="true" className="size-4" />
    ) : channel === 'web' ? (
      <Globe aria-hidden="true" className="size-4" />
    ) : (
      <Share2 aria-hidden="true" className="size-4" />
    ))
  );
}

/**
 * Type, channel, source and status behind the shared Filters menu, the same
 * control the Library uses, so the subbar is one line at any width.
 */
export default function PublishingContentLibraryToolbar({
  accountOptions,
  channelOptions,
  channelValue,
  isAttached,
  items,
  sourceValue,
  statusOptions,
  statusValue,
  typeValue,
  onChannelChange,
  onClear,
  onSourceChange,
  onStatusChange,
  onTypeChange,
}: PublishingContentLibraryToolbarProps) {
  const translate = useTranslations('pages.posts.list.toolbar');
  const translateMenu = useTranslations('ui.filtersButton');
  const allLabel = translateMenu('all');

  const typeLabels: Record<(typeof PUBLISHING_CONTENT_TYPES)[number], string> =
    {
      article: translate('typeArticle'),
      newsletter: translate('typeNewsletter'),
      post: translate('typePost'),
    };

  const facets: FilterMenuFacet[] = [
    {
      defaultValue: FACET_ALL,
      key: 'type',
      label: translate('typeAria'),
      onChange: (value) => onTypeChange(value as PublishingContentTypeFilter),
      options: [
        { count: items.length, label: allLabel, value: FACET_ALL },
        ...PUBLISHING_CONTENT_TYPES.map((type) => ({
          count: items.filter((item) => item.type === type).length,
          label: typeLabels[type],
          value: type,
        })),
      ],
      selection: 'single',
      value: typeValue,
    },
    {
      defaultValue: FACET_ALL,
      key: 'channel',
      label: translate('channelAria'),
      onChange: onChannelChange,
      options: [
        { count: items.length, label: allLabel, value: FACET_ALL },
        ...accountOptions.map((account) => ({
          count: items.filter((item) =>
            item.accounts?.some((candidate) => candidate.id === account.id),
          ).length,
          icon: renderChannelIcon(account.platform),
          isLiteral: true,
          label: account.label,
          value: `${CHANNEL_ACCOUNT_PREFIX}${account.id}`,
        })),
        ...channelOptions.map((channel) => ({
          count: items.filter((item) =>
            (item.channels ?? [item.channel]).includes(channel.value),
          ).length,
          icon: renderChannelIcon(channel.value),
          label: channel.label,
          value: channel.value,
        })),
      ],
      searchPlaceholder: translate('searchChannels'),
      selection: 'single',
      value: channelValue,
    },
    {
      defaultValue: FACET_ALL,
      key: 'source',
      label: translate('sourceAria'),
      onChange: (value) => onSourceChange(parsePostsSource(value)),
      options: [
        { label: translate('sourceExtension'), value: POSTS_SOURCE_EXTENSION },
      ],
      selection: 'single',
      value: sourceValue ?? FACET_ALL,
    },
    {
      key: 'status',
      label: translate('statusAria'),
      onChange: onStatusChange,
      options: statusOptions.map((option) => ({
        count: items.filter((item) => item.status === option.value).length,
        label: option.label || formatPublishingContentStatus(option.value),
        value: option.value,
      })),
      selection: 'multiple',
      values: statusValue,
    },
  ];

  return (
    <FilterMenu facets={facets} isAttached={isAttached} onClear={onClear} />
  );
}
