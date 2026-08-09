'use client';

import { ComponentSize } from '@genfeedai/enums';
import type { PublishContentTypeFilter } from '@pages/posts/library/publish-content-library.helpers';
import { PUBLISH_CONTENT_TYPES } from '@pages/posts/library/publish-content-library.helpers';
import FormSearchbar from '@ui/primitives/searchbar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import type { ChangeEvent } from 'react';

interface FilterOption {
  label: string;
  value: string;
}

export interface PublishContentLibraryToolbarProps {
  channelOptions: FilterOption[];
  channelValue: string;
  searchValue: string;
  statusOptions: FilterOption[];
  statusValue: string;
  typeValue: PublishContentTypeFilter;
  onChannelChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onTypeChange: (value: PublishContentTypeFilter) => void;
}

export default function PublishContentLibraryToolbar({
  channelOptions,
  channelValue,
  searchValue,
  statusOptions,
  statusValue,
  typeValue,
  onChannelChange,
  onSearchChange,
  onStatusChange,
  onTypeChange,
}: PublishContentLibraryToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="w-48 sm:w-56 xl:w-64">
        <FormSearchbar
          value={searchValue}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            onSearchChange(event.target.value)
          }
          onClear={() => onSearchChange('')}
          placeholder="Search content"
          size={ComponentSize.SM}
          className="w-full"
          inputClassName="h-8 rounded-md border-white/10 bg-white/[0.03] text-white/90 focus:border-white/20 focus:outline-none"
        />
      </div>

      <Select
        value={typeValue}
        onValueChange={(value) =>
          onTypeChange(value as PublishContentTypeFilter)
        }
      >
        <SelectTrigger
          aria-label="Content type"
          className="h-8 w-32 rounded-md border-white/10 bg-white/[0.03]"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All types</SelectItem>
          {PUBLISH_CONTENT_TYPES.map((type) => (
            <SelectItem key={type} value={type}>
              {type === 'post'
                ? 'Posts'
                : type === 'article'
                  ? 'Articles'
                  : 'Newsletters'}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={channelValue} onValueChange={onChannelChange}>
        <SelectTrigger
          aria-label="Channel"
          className="h-8 w-36 rounded-md border-white/10 bg-white/[0.03]"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All channels</SelectItem>
          {channelOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={statusValue} onValueChange={onStatusChange}>
        <SelectTrigger
          aria-label="Lifecycle status"
          className="h-8 w-40 rounded-md border-white/10 bg-white/[0.03]"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          {statusOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
