'use client';

import { ComponentSize, PostStatus } from '@genfeedai/contracts';
import type { PublishingPostsView } from '@pages/posts/list/posts-list-query';
import FormSearchbar from '@ui/primitives/searchbar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
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
  searchValue: string;
  sortValue: string;
  sortOptions: PostsListToolbarOption[];
  onSearchChange: (value: string) => void;
  onSortChange: (value: string) => void;
  onPublishingViewChange?: (value: PublishingPostsView) => void;
  publishingView?: PublishingPostsView;
}

export default function PostsListToolbar({
  searchValue,
  sortValue,
  sortOptions,
  onSearchChange,
  onSortChange,
  onPublishingViewChange,
  publishingView,
}: PostsListToolbarProps) {
  const translate = useTranslations('pages.posts.list');

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="w-48 sm:w-56 xl:w-64">
        <FormSearchbar
          value={searchValue}
          onSearch={onSearchChange}
          placeholder={translate('toolbar.searchPlaceholder')}
          // SM keeps the control on the same 32px shell row as ViewToggle + refresh.
          size={ComponentSize.SM}
          className="w-full"
        />
      </div>

      {publishingView && onPublishingViewChange ? (
        <Select
          value={publishingView}
          onValueChange={(value) =>
            onPublishingViewChange(value as PublishingPostsView)
          }
        >
          <SelectTrigger
            aria-label={translate('toolbar.publishingStateAria')}
            className="w-32"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PUBLISHING_VIEW_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {translate(`toolbar.${option.messageKey}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      <Select value={sortValue} onValueChange={onSortChange}>
        <SelectTrigger aria-label="Sort" className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {sortOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
