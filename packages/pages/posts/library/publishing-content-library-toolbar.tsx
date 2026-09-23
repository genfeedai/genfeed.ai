'use client';

import { ButtonSize, ButtonVariant, ComponentSize } from '@genfeedai/contracts';
import type { PublishingContentTypeFilter } from '@pages/posts/library/publishing-content-library.helpers';
import { PUBLISHING_CONTENT_TYPES } from '@pages/posts/library/publishing-content-library.helpers';
import DropdownMultiSelect from '@ui/dropdowns/multiselect/DropdownMultiSelect';
import { Button } from '@ui/primitives/button';
import { ghostSelectTriggerClassName } from '@ui/primitives/field-control';
import FormSearchbar from '@ui/primitives/searchbar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { ClipboardCheck } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

interface FilterOption {
  label: string;
  value: string;
}

export interface PublishingContentLibraryToolbarProps {
  /** Link to the approval queue, carrying any selected batch/item along. */
  approvalQueueHref?: string;
  channelOptions: FilterOption[];
  channelValue: string;
  searchValue: string;
  statusOptions: FilterOption[];
  statusValue: string[];
  typeValue: PublishingContentTypeFilter;
  onChannelChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: string[]) => void;
  onTypeChange: (value: PublishingContentTypeFilter) => void;
}

export default function PublishingContentLibraryToolbar({
  approvalQueueHref,
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
  const translate = useTranslations('pages.posts.library');
  return (
    // Sized by the surrounding toolbar row, not its content: the search box
    // absorbs the squeeze and Approval Queue drops to its icon when the row
    // narrows (inspector open), so the filters stay on one line. Items only
    // wrap as a last resort on phone widths.
    <div className="@container/posts-toolbar min-w-32 flex-1">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="min-w-32 max-w-64 flex-1">
          <FormSearchbar
            value={searchValue}
            onSearch={onSearchChange}
            placeholder="Search posts"
            size={ComponentSize.SM}
            className="w-full"
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

        <Select value={channelValue} onValueChange={onChannelChange}>
          <SelectTrigger
            aria-label="Channel"
            className={ghostSelectTriggerClassName}
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

        <DropdownMultiSelect
          variant={ButtonVariant.GHOST}
          name="status"
          options={statusOptions}
          values={statusValue}
          onChange={(_name, values) => onStatusChange(values)}
          placeholder="All statuses"
        />

        {approvalQueueHref ? (
          <Button
            asChild
            size={ButtonSize.SM}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          >
            <Link
              aria-label={translate('approvalQueue')}
              href={approvalQueueHref}
            >
              <ClipboardCheck aria-hidden="true" className="size-3.5" />
              <span className="hidden @[42rem]/posts-toolbar:inline">
                {translate('approvalQueue')}
              </span>
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
