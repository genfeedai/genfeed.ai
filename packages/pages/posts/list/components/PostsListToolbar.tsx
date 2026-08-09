'use client';

import { ComponentSize, PostStatus } from '@genfeedai/enums';
import type { PublisherPostsView } from '@pages/posts/list/posts-list-query';
import ButtonDropdown from '@ui/buttons/dropdown/button-dropdown/ButtonDropdown';
import FormSearchbar from '@ui/primitives/searchbar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import type { ChangeEvent } from 'react';

export interface PostsListToolbarOption {
  label: string;
  value: string;
}

/**
 * Held as data rather than inline JSX so the labels stay one translatable list
 * once shared packages gain a message catalog.
 */
const PUBLISHER_VIEW_OPTIONS: {
  label: string;
  value: PublisherPostsView;
}[] = [
  { label: 'Not posted', value: 'not-posted' },
  { label: 'Pending', value: PostStatus.PENDING },
  { label: 'Publishing', value: PostStatus.PROCESSING },
  { label: 'Posted', value: 'posted' },
  { label: 'Failed', value: PostStatus.FAILED },
];

export interface PostsListToolbarProps {
  searchValue: string;
  sortValue: string;
  sortOptions: PostsListToolbarOption[];
  onSearchChange: (value: string) => void;
  onSortChange: (value: string) => void;
  onPublisherViewChange?: (value: PublisherPostsView) => void;
  publisherView?: PublisherPostsView;
}

export default function PostsListToolbar({
  searchValue,
  sortValue,
  sortOptions,
  onSearchChange,
  onSortChange,
  onPublisherViewChange,
  publisherView,
}: PostsListToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="w-48 sm:w-56 xl:w-64">
        <FormSearchbar
          value={searchValue}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            onSearchChange(event.target.value)
          }
          onClear={() => onSearchChange('')}
          placeholder="Search posts"
          // SM keeps the control on the same 32px shell row as ViewToggle + refresh.
          size={ComponentSize.SM}
          className="w-full"
          inputClassName="h-8 rounded-md border-white/10 bg-white/[0.03] text-white/90 focus:border-white/20 focus:outline-none"
        />
      </div>

      {publisherView && onPublisherViewChange ? (
        <Select
          value={publisherView}
          onValueChange={(value) =>
            onPublisherViewChange(value as PublisherPostsView)
          }
        >
          <SelectTrigger
            aria-label="Publishing state"
            className="h-8 w-32 rounded-md border-white/10 bg-white/[0.03]"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PUBLISHER_VIEW_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
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
        className="h-8 rounded-md border border-white/10 bg-white/[0.03] px-3 text-sm text-white/80 hover:bg-white/[0.06] hover:text-white"
      />
    </div>
  );
}
