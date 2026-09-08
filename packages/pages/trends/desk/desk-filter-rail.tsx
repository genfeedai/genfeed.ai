'use client';

import type { DiscoveryDeskContentTypeFilter } from '@pages/trends/desk/desk-state';
import type {
  DiscoveryDeskSort,
  DiscoveryDeskSource,
} from '@props/trends/discovery-desk.props';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { ToggleGroup, ToggleGroupItem } from '@ui/primitives/toggle-group';
import { useCallback } from 'react';

/**
 * `following` is deliberately absent. It is a Discovery sidebar destination
 * (`discovery-menu-items.config.ts` matches it on `?source=following`), not a
 * filter: choosing it swaps the desk table for the per-platform Following deck
 * and unmounts this rail, so the control that set it disappears and only the
 * sidebar can undo it. The remaining values narrow the desk in place.
 */
const SOURCE_OPTIONS: { label: string; value: DiscoveryDeskSource | 'all' }[] =
  [
    { label: 'All', value: 'all' },
    { label: 'Public trends', value: 'trends' },
    { label: 'My accounts', value: 'owned' },
  ];

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

/**
 * The Desk's control rail: source segmented control, content-type and sort
 * selects, and the Sources menu (Follow / Manage / Sync all), formerly split
 * across `trends-list.tsx` and `following-page.tsx`.
 */
export default function DeskFilterRail({
  contentType,
  onContentTypeChange,
  onSort,
  onSourceChange,
  sort,
  source,
}: {
  contentType: DiscoveryDeskContentTypeFilter;
  onContentTypeChange: (value: DiscoveryDeskContentTypeFilter) => void;
  onSort: (value: DiscoveryDeskSort) => void;
  onSourceChange: (value: DiscoveryDeskSource | 'all') => void;
  sort: DiscoveryDeskSort;
  source: DiscoveryDeskSource | 'all';
}) {
  const handleSourceValueChange = useCallback(
    (value: string) => {
      if (!value) return;
      onSourceChange(value as DiscoveryDeskSource | 'all');
    },
    [onSourceChange],
  );

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <ToggleGroup
        onValueChange={handleSourceValueChange}
        type="single"
        value={source}
        variant="outline"
      >
        {SOURCE_OPTIONS.map((option) => (
          <ToggleGroupItem key={option.value} value={option.value}>
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          onValueChange={(value) =>
            onContentTypeChange(value as DiscoveryDeskContentTypeFilter)
          }
          value={contentType}
        >
          <SelectTrigger className="h-8 w-36">
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
          <SelectTrigger className="h-8 w-36">
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
    </div>
  );
}
