'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { getPlatformIcon } from '@helpers/ui/platform-icon/platform-icon.helper';
import type { DiscoveryDeskContentTypeFilter } from '@pages/trends/desk/desk-state';
import type {
  DiscoveryDeskItem,
  DiscoveryDeskSort,
  DiscoveryDeskSource,
} from '@props/trends/discovery-desk.props';
import type { TrendsSummary } from '@props/trends/trends-page.props';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';

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
  source,
  onSourceChange,
  activePlatforms,
  onTogglePlatform,
  onClearPlatforms,
  items,
  summary,
  onContentTypeChange,
  onSort,
  sort,
}: {
  source: DiscoveryDeskSource | 'all';
  onSourceChange: (value: DiscoveryDeskSource | 'all') => void;
  activePlatforms: Set<string>;
  onTogglePlatform: (platform: string) => void;
  onClearPlatforms: () => void;
  items: DiscoveryDeskItem[];
  summary: TrendsSummary;
  contentType: DiscoveryDeskContentTypeFilter;
  onContentTypeChange: (value: DiscoveryDeskContentTypeFilter) => void;
  onSort: (value: DiscoveryDeskSort) => void;
  sort: DiscoveryDeskSort;
}) {
  const translate = useTranslations('common.trends.desk');
  const platforms = Array.from(
    new Set([
      ...summary.connectedPlatforms,
      ...summary.lockedPlatforms,
      ...items.map((item) => item.platform),
    ]),
  ).sort();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={source}
        onValueChange={(value) =>
          onSourceChange(value as DiscoveryDeskSource | 'all')
        }
      >
        <SelectTrigger aria-label="Source" className="h-8 w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(['all', 'trends', 'owned', 'imported'] as const).map((value) => (
            <SelectItem key={value} value={value}>
              {translate(`sourceTabs.${value}`)}
            </SelectItem>
          ))}
          <SelectItem value="following">Following</SelectItem>
        </SelectContent>
      </Select>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ariaLabel="Platforms"
            className="h-8 gap-2"
            variant={ButtonVariant.SECONDARY}
            withWrapper={false}
          >
            {activePlatforms.size === 1
              ? Array.from(activePlatforms)[0]
              : activePlatforms.size
                ? `${activePlatforms.size} platforms`
                : 'All platforms'}
            <ChevronDown className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuCheckboxItem
            checked={activePlatforms.size === 0}
            onCheckedChange={onClearPlatforms}
            onSelect={(event) => event.preventDefault()}
          >
            All platforms
          </DropdownMenuCheckboxItem>
          {platforms.map((platform) => (
            <DropdownMenuCheckboxItem
              key={platform}
              checked={activePlatforms.has(platform)}
              onCheckedChange={() => onTogglePlatform(platform)}
              onSelect={(event) => event.preventDefault()}
            >
              {getPlatformIcon(platform, 'size-4')}
              <span className="capitalize">{platform}</span>
              <span className="ml-auto text-foreground/55">
                {items.filter((item) => item.platform === platform).length}
              </span>
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Select
        onValueChange={(value) =>
          onContentTypeChange(value as DiscoveryDeskContentTypeFilter)
        }
        value={contentType}
      >
        <SelectTrigger aria-label="Content type" className="h-8 w-32">
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
        <SelectTrigger aria-label="Sort" className="h-8 w-32">
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
