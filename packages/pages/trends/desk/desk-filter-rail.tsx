'use client';

import type { DiscoveryDeskContentTypeFilter } from '@pages/trends/desk/desk-state';
import type { DiscoveryDeskSort } from '@props/trends/discovery-desk.props';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';

const CONTENT_TYPE_OPTIONS: {
  label: string;
  value: DiscoveryDeskContentTypeFilter;
}[] = [
  { label: 'All types', value: 'all' },
  { label: 'Video', value: 'video' },
  { label: 'Image', value: 'image' },
  { label: 'Post', value: 'post' },
];

const SORT_OPTIONS: { label: string; value: DiscoveryDeskSort }[] = [
  { label: 'Velocity', value: 'velocity' },
  { label: 'Virality', value: 'virality' },
  { label: 'Recency', value: 'recency' },
  { label: 'Engagement', value: 'engagement' },
];

export default function DeskFilterRail({
  contentType,
  onContentTypeChange,
  onSort,
  sort,
}: {
  contentType: DiscoveryDeskContentTypeFilter;
  onContentTypeChange: (value: DiscoveryDeskContentTypeFilter) => void;
  onSort: (value: DiscoveryDeskSort) => void;
  sort: DiscoveryDeskSort;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        onValueChange={(value) =>
          onContentTypeChange(value as DiscoveryDeskContentTypeFilter)
        }
        value={contentType}
      >
        <SelectTrigger aria-label="Content type" className="h-8 w-36">
          <SelectValue placeholder="Content type" />
        </SelectTrigger>
        <SelectContent>
          {CONTENT_TYPE_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        onValueChange={(value) => onSort(value as DiscoveryDeskSort)}
        value={sort}
      >
        <SelectTrigger aria-label="Sort" className="h-8 w-36">
          <SelectValue placeholder="Sort" />
        </SelectTrigger>
        <SelectContent>
          {SORT_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
