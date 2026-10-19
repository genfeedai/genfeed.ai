'use client';

import { ButtonVariant, ComponentSize } from '@genfeedai/contracts';
import type { PublishingContentTypeFilter } from '@pages/posts/library/publishing-content-library.helpers';
import { PUBLISHING_CONTENT_TYPES } from '@pages/posts/library/publishing-content-library.helpers';
import PostsSourceSelect from '@pages/posts/list/components/PostsSourceSelect';
import type { PostsSourceFilter } from '@pages/posts/list/posts-list-query';
import type { PublishingContentAccount } from '@props/posts/publishing-content-entry.props';
import DropdownChannel from '@ui/dropdowns/channel/DropdownChannel';
import DropdownMultiSelect from '@ui/dropdowns/multiselect/DropdownMultiSelect';
import { ghostSelectTriggerClassName } from '@ui/primitives/field-control';
import FormSearchbar from '@ui/primitives/searchbar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';

interface FilterOption {
  label: string;
  value: string;
}

export interface PublishingContentLibraryToolbarProps {
  showSearch?: boolean;
  accountOptions: PublishingContentAccount[];
  channelOptions: FilterOption[];
  channelValue: string;
  searchValue: string;
  sourceValue?: PostsSourceFilter;
  statusOptions: FilterOption[];
  statusValue: string[];
  typeValue: PublishingContentTypeFilter;
  onChannelChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onSourceChange: (value: PostsSourceFilter | undefined) => void;
  onStatusChange: (value: string[]) => void;
  onTypeChange: (value: PublishingContentTypeFilter) => void;
}

export function PublishingContentLibrarySearch({
  searchValue,
  onSearchChange,
}: Pick<
  PublishingContentLibraryToolbarProps,
  'searchValue' | 'onSearchChange'
>) {
  return (
    <div className="w-40 @[56rem]/publishing:w-64">
      <FormSearchbar
        value={searchValue}
        onSearch={onSearchChange}
        placeholder="Search posts"
        size={ComponentSize.SM}
        className="w-full"
      />
    </div>
  );
}

export default function PublishingContentLibraryToolbar({
  showSearch = true,
  accountOptions,
  channelOptions,
  channelValue,
  searchValue,
  sourceValue,
  statusOptions,
  statusValue,
  typeValue,
  onChannelChange,
  onSearchChange,
  onSourceChange,
  onStatusChange,
  onTypeChange,
}: PublishingContentLibraryToolbarProps) {
  return (
    // Tiers key off the Publishing page width (`@container/publishing` on the
    // layout Container), so opening the inspector compacts the row — narrower
    // search, icon-only Approval Queue — instead of wrapping it. Items only
    // wrap as a last resort on phone widths.
    <div className="flex flex-wrap items-center justify-end gap-2">
      {showSearch ? (
        <PublishingContentLibrarySearch
          searchValue={searchValue}
          onSearchChange={onSearchChange}
        />
      ) : null}

      <Select
        value={typeValue}
        onValueChange={(value) =>
          onTypeChange(value as PublishingContentTypeFilter)
        }
      >
        <SelectTrigger
          aria-label="Content type"
          className={ghostSelectTriggerClassName}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All types</SelectItem>
          {PUBLISHING_CONTENT_TYPES.map((type) => (
            <SelectItem key={type} value={type}>
              {type === 'post'
                ? 'Social posts'
                : type === 'article'
                  ? 'Articles'
                  : 'Newsletters'}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <DropdownChannel
        accounts={accountOptions}
        ariaLabel="Channel"
        channels={channelOptions}
        value={channelValue}
        onChange={onChannelChange}
      />

      <PostsSourceSelect
        onSourceChange={onSourceChange}
        sourceValue={sourceValue}
      />

      <DropdownMultiSelect
        variant={ButtonVariant.GHOST}
        name="status"
        options={statusOptions}
        values={statusValue}
        onChange={(_name, values) => onStatusChange(values)}
        placeholder="All statuses"
      />
    </div>
  );
}
