'use client';

import { cn } from '@helpers/formatting/cn/cn.util';
import type { ModelSelectorFamilyItemProps } from '@props/ui/model-selector/model-selector.props';
import { memo } from 'react';
import { HiChevronDown, HiChevronRight } from 'react-icons/hi2';

function ProviderBadge({
  brandColor,
  brandIcon: BrandIcon,
  brandLabel,
}: Pick<
  ModelSelectorFamilyItemProps,
  'brandColor' | 'brandIcon' | 'brandLabel'
>) {
  return (
    <div
      className="mt-0.5 h-5 w-5 rounded border border-white/8 flex items-center justify-center shrink-0"
      style={{ backgroundColor: `${brandColor}1f`, color: brandColor }}
    >
      {BrandIcon ? (
        <BrandIcon
          className="h-3.5 w-3.5"
          data-testid="model-family-provider-icon"
        />
      ) : (
        <span className="text-[10px] font-semibold leading-none">
          {brandLabel.charAt(0)}
        </span>
      )}
    </div>
  );
}

const ModelSelectorFamilyItem = memo(function ModelSelectorFamilyItem({
  brandColor,
  brandIcon,
  brandLabel,
  count,
  familyLabel,
  isExpanded,
  onToggle,
}: ModelSelectorFamilyItemProps) {
  const ChevronIcon = isExpanded ? HiChevronDown : HiChevronRight;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isExpanded}
      aria-label={familyLabel}
      className={cn(
        'group flex w-full items-center gap-2.5 rounded px-2 py-2 text-left transition-colors',
        'hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20',
      )}
    >
      <ChevronIcon className="h-3.5 w-3.5 shrink-0 text-foreground/45 transition-transform" />
      <ProviderBadge
        brandColor={brandColor}
        brandIcon={brandIcon}
        brandLabel={brandLabel}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {familyLabel}
          </span>
          <span className="rounded-full border border-white/8 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground/45">
            {count}
          </span>
        </div>
      </div>
    </button>
  );
});

export default ModelSelectorFamilyItem;
