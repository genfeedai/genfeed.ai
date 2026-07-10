'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { ModelSelectorFamilyItemProps } from '@genfeedai/props/ui/model-selector/model-selector.props';
import { Button } from '@ui/primitives/button';
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
      className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border border-border"
      style={{ backgroundColor: `${brandColor}1f`, color: brandColor }}
    >
      {BrandIcon ? (
        <BrandIcon
          className="size-3.5"
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
    <Button
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
      onClick={onToggle}
      aria-expanded={isExpanded}
      ariaLabel={familyLabel}
      className={cn(
        'group flex min-h-11 w-full items-center gap-2.5 rounded px-2 py-2 text-left transition-colors lg:min-h-0',
        'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      <ChevronIcon className="size-3.5 shrink-0 text-foreground/45 transition-transform" />
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
          <span className="rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground/45">
            {count}
          </span>
        </div>
      </div>
    </Button>
  );
});

export default ModelSelectorFamilyItem;
