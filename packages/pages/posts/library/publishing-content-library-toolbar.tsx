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
    <div className="flex flex-wrap items-center gap-2">
      <div className="w-48 sm:w-56 xl:w-64">
        <FormSearchbar
          value={searchValue}
          onSearch={onSearchChange}
          placeholder="Search posts"
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
          <Link href={approvalQueueHref}>
            <ClipboardCheck aria-hidden="true" className="size-3.5" />
            {translate('approvalQueue')}
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
