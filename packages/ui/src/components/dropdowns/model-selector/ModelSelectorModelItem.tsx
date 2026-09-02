'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { ModelSelectorModelItemProps } from '@genfeedai/props/ui/model-selector/model-selector.props';
import ModelSelectorBrandMark from '@ui/dropdowns/model-selector/ModelSelectorBrandMark';
import ModelSelectorCostBadge from '@ui/dropdowns/model-selector/ModelSelectorCostBadge';
import ModelSelectorModelSpec from '@ui/dropdowns/model-selector/ModelSelectorModelSpec';
import ModelSelectorQualityBar from '@ui/dropdowns/model-selector/ModelSelectorQualityBar';
import { getModelRowCapabilities } from '@ui/dropdowns/model-selector/model-selector.utils';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import { CommandItem } from '@ui/primitives/command';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@ui/primitives/tooltip';
import { Check, Star } from 'lucide-react';
import type { MouseEvent, PointerEvent } from 'react';
import { memo, useCallback } from 'react';

/**
 * One flat row — brand, name, capability icons, price. No family nesting and
 * no description line: the row's job is to be scanned, and the hover spec
 * carries everything the row drops.
 */
const ModelSelectorModelItem = memo(function ModelSelectorModelItem({
  option,
  isSelected,
  onToggle,
  onFavoriteToggle,
  selectionMode = 'multi',
  isLocked = false,
  lockReason,
}: ModelSelectorModelItemProps) {
  const { model, brandLabel, costTier, isFavorite } = option;
  const isSingleSelect = selectionMode === 'single';
  const capabilities = getModelRowCapabilities(model);

  const handleSelect = useCallback(() => {
    if (isLocked) {
      return;
    }
    onToggle(model.key);
  }, [isLocked, onToggle, model.key]);

  const handleFavoriteClick = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      onFavoriteToggle(model.key);
    },
    [onFavoriteToggle, model.key],
  );

  const handlePointerDown = useCallback(
    (event: PointerEvent) => {
      if (!isSingleSelect || isLocked || event.button !== 0) {
        return;
      }

      // cmdk can consume the first pointer click inside a Radix popover before
      // its onSelect fires. Commit single-select rows at pointer down, matching
      // the already-reliable Auto rows; keyboard selection still uses onSelect.
      event.preventDefault();
      handleSelect();
    },
    [handleSelect, isLocked, isSingleSelect],
  );

  const handleFavoritePointerDown = useCallback((event: PointerEvent) => {
    // The favorite button is intentionally nested in cmdk's non-button row.
    // Keep its pointer gesture from selecting the surrounding model.
    event.stopPropagation();
  }, []);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <CommandItem
          value={`${model.label} ${brandLabel} ${model.description ?? ''}`}
          onSelect={handleSelect}
          onPointerDown={handlePointerDown}
          disabled={isLocked}
          aria-disabled={isLocked || undefined}
          className={cn(
            'flex min-h-7 cursor-pointer items-center gap-2 rounded-sm px-1.5 py-0.5 text-xs text-foreground transition-colors data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground',
            isSelected && 'bg-background-tertiary',
            isLocked && 'cursor-not-allowed opacity-50',
          )}
        >
          <ModelSelectorBrandMark
            brandColor={option.brandColor}
            brandIcon={option.brandIcon}
            brandLabel={brandLabel}
            testId="model-row-provider-icon"
          />

          <div className="pointer-events-none flex size-5 shrink-0 items-center justify-center">
            {isSingleSelect ? (
              isSelected ? (
                <Check className="size-3.5 text-foreground" aria-hidden />
              ) : (
                <span className="size-3.5" aria-hidden />
              )
            ) : (
              <Checkbox
                name={`model-${model.key}`}
                isChecked={isSelected}
                onChange={() => {}}
                className="size-3.5 !border-border data-[state=checked]:!border-foreground data-[state=checked]:!bg-foreground data-[state=checked]:!text-background"
              />
            )}
          </div>

          <span className="min-w-0 flex-1 truncate font-medium">
            {model.label}
          </span>

          {capabilities.map((capability) => {
            const CapabilityIcon = capability.icon;

            return (
              <span
                key={capability.id}
                role="img"
                aria-label={capability.label}
                className="shrink-0 text-foreground/40"
              >
                <CapabilityIcon className="size-3.5" aria-hidden />
              </span>
            );
          })}

          <ModelSelectorQualityBar qualityTier={model.qualityTier} />
          <ModelSelectorCostBadge costTier={costTier} />

          {isLocked ? (
            <span className="shrink-0 rounded-full border border-destructive/20 bg-destructive/10 px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-[0.12em] text-destructive">
              Credits
            </span>
          ) : null}

          {option.isDeprecated ? (
            <span className="shrink-0 rounded-full border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-[0.12em] text-amber-300">
              Legacy
            </span>
          ) : null}

          <Button
            ariaLabel={`${isFavorite ? 'Remove' : 'Add'} ${model.label} ${isFavorite ? 'from' : 'to'} favorites`}
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
            onClick={handleFavoriteClick}
            onPointerDown={handleFavoritePointerDown}
            className={cn(
              '-my-1.5 flex size-9 shrink-0 items-center justify-center rounded-sm transition-colors hover:bg-accent lg:my-0 lg:size-6',
              isFavorite
                ? 'text-foreground'
                : 'text-foreground/20 hover:text-foreground/40',
            )}
          >
            <Star className={cn('size-3.5', isFavorite && 'fill-current')} />
          </Button>
        </CommandItem>
      </TooltipTrigger>

      <TooltipContent
        side="right"
        align="start"
        sideOffset={12}
        collisionPadding={12}
        className="max-w-none p-2.5 font-normal"
      >
        <ModelSelectorModelSpec option={option} lockReason={lockReason} />
      </TooltipContent>
    </Tooltip>
  );
});

export default ModelSelectorModelItem;
