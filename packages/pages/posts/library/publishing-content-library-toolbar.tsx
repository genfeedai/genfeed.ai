'use client';

import { ComponentSize } from '@genfeedai/enums';
import type { PublishingContentTypeFilter } from '@pages/posts/library/publishing-content-library.helpers';
import { PUBLISHING_CONTENT_TYPES } from '@pages/posts/library/publishing-content-library.helpers';
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

export interface PublishingContentLibraryToolbarProps {
  channelOptions: FilterOption[];
  channelValue: string;
  searchValue: string;
  statusOptions: FilterOption[];
  statusValue: string;
  typeValue: PublishingContentTypeFilter;
  onChannelChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onTypeChange: (value: PublishingContentTypeFilter) => void;
}

export default function PublishingContentLibraryToolbar({
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
}: PublishingContentLibraryToolbarProps) {
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
          inputClassName="h-8 rounded-md border-border bg-card text-foreground focus:border-border-strong focus:outline-none"
        />
      </div>

      <Select
        value={typeValue}
        onValueChange={(value) =>
          onTypeChange(value as PublishingContentTypeFilter)
        }
      >
        <SelectTrigger
          aria-label="Content type"
          className="h-8 w-32 rounded-md border-border bg-card text-foreground"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All types</SelectItem>
          {PUBLISHING_CONTENT_TYPES.map((type) => (
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
          className="h-8 w-36 rounded-md border-border bg-card text-foreground"
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
          className="h-8 w-40 rounded-md border-border bg-card text-foreground"
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
