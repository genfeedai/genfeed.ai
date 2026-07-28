'use client';

import { ComponentSize } from '@genfeedai/enums';
import type { PostsPublicationState } from '@pages/posts/list/posts-list-query';
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

export interface PostsListToolbarProps {
  searchValue: string;
  sortValue: string;
  sortOptions: PostsListToolbarOption[];
  onSearchChange: (value: string) => void;
  onSortChange: (value: string) => void;
  onPublicationStateChange?: (value: PostsPublicationState) => void;
  publicationState?: PostsPublicationState;
}

export default function PostsListToolbar({
  searchValue,
  sortValue,
  sortOptions,
  onSearchChange,
  onSortChange,
  onPublicationStateChange,
  publicationState,
}: PostsListToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="w-56 xl:w-72">
        <FormSearchbar
          value={searchValue}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            onSearchChange(event.target.value)
          }
          onClear={() => onSearchChange('')}
          placeholder="Search posts"
          size={ComponentSize.MD}
          className="w-full"
          inputClassName="rounded-lg border-white/10 bg-white/[0.03] text-white/90 focus:border-white/20 focus:outline-none"
        />
      </div>

      {publicationState && onPublicationStateChange ? (
        <Select
          value={publicationState}
          onValueChange={(value) =>
            onPublicationStateChange(value as PostsPublicationState)
          }
        >
          <SelectTrigger
            aria-label="Publishing state"
            className="h-10 w-36 rounded-lg border-white/10 bg-white/[0.03]"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="not-posted">Not posted</SelectItem>
            <SelectItem value="posted">Posted</SelectItem>
          </SelectContent>
        </Select>
      ) : null}

      <ButtonDropdown
        name="sort"
        value={sortValue}
        options={sortOptions}
        onChange={(_name, value) => onSortChange(value)}
        className="h-10 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-white/80 hover:bg-white/[0.06] hover:text-white"
      />
    </div>
  );
}
