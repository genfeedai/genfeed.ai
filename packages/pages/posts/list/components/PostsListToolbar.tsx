'use client';

import { ComponentSize } from '@genfeedai/enums';
import ButtonDropdown from '@ui/buttons/dropdown/button-dropdown/ButtonDropdown';
import FormSearchbar from '@ui/primitives/searchbar';
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
}

export default function PostsListToolbar({
  searchValue,
  sortValue,
  sortOptions,
  onSearchChange,
  onSortChange,
}: PostsListToolbarProps) {
  return (
    <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="w-full md:max-w-md">
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

      <div className="flex items-center justify-end">
        <ButtonDropdown
          name="sort"
          value={sortValue}
          options={sortOptions}
          onChange={(_name, value) => onSortChange(value)}
          className="h-10 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-white/80 hover:bg-white/[0.06] hover:text-white"
        />
      </div>
    </div>
  );
}
