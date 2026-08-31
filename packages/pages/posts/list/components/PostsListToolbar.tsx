'use client';

import { ComponentSize, PostStatus } from '@genfeedai/enums';
import type { PublishingPostsView } from '@pages/posts/list/posts-list-query';
import ButtonDropdown from '@ui/buttons/dropdown/button-dropdown/ButtonDropdown';
import FormSearchbar from '@ui/primitives/searchbar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { useTranslations } from 'next-intl';
import type { ChangeEvent } from 'react';

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
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            onSearchChange(event.target.value)
          }
          onClear={() => onSearchChange('')}
          placeholder={translate('toolbar.searchPlaceholder')}
          // SM keeps the control on the same 32px shell row as ViewToggle + refresh.
          size={ComponentSize.SM}
          className="w-full"
          inputClassName="h-8 rounded-md border-border bg-card text-foreground focus:border-border-strong focus:outline-none"
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
            className="h-8 w-32 rounded-md border-border bg-card text-foreground"
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

      <ButtonDropdown
        name="sort"
        value={sortValue}
        options={sortOptions}
        onChange={(_name, value) => onSortChange(value)}
        className="h-8 rounded-md border border-border bg-secondary px-3 text-sm text-foreground/80 hover:bg-hover hover:text-foreground"
      />
    </div>
  );
}
