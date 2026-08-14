'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { ModelSelectorFamilyItemProps } from '@genfeedai/props/ui/model-selector/model-selector.props';
import ModelSelectorBrandMark from '@ui/dropdowns/model-selector/ModelSelectorBrandMark';
import { CommandItem } from '@ui/primitives/command';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { memo } from 'react';

const ModelSelectorFamilyItem = memo(function ModelSelectorFamilyItem({
  accessibleName,
  brandColor,
  brandIcon,
  brandLabel,
  count,
  familyLabel,
  isExpanded,
  onToggle,
}: ModelSelectorFamilyItemProps) {
  const ChevronIcon = isExpanded ? ChevronDown : ChevronRight;

  // A CommandItem, not a Button: this row lives inside a cmdk CommandGroup,
  // and cmdk's roving keyboard navigation only visits [cmdk-item] elements.
  // As a plain button the family header was skipped by ArrowUp/ArrowDown, so
  // a collapsed family could not be expanded without leaving the list.
  return (
    <CommandItem
      value={`${familyLabel} ${brandLabel}`}
      onSelect={onToggle}
      aria-label={
        accessibleName ??
        `${familyLabel}, ${brandLabel}, ${isExpanded ? 'expanded' : 'collapsed'}`
      }
      className={cn(
        'group flex min-h-7 w-full cursor-pointer items-center gap-2 rounded-sm px-1.5 py-0.5 text-left transition-colors',
        'hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      <ChevronIcon className="size-3.5 shrink-0 text-foreground/45 transition-transform" />
      <ModelSelectorBrandMark
        brandColor={brandColor}
        brandIcon={brandIcon}
        brandLabel={brandLabel}
        testId="model-family-provider-icon"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium text-foreground">
            {familyLabel}
          </span>
          <span className="rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground/45">
            {count}
          </span>
        </div>
      </div>
    </CommandItem>
  );
});

export default ModelSelectorFamilyItem;
