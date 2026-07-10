'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { ModelSelectorModelItemProps } from '@genfeedai/props/ui/model-selector/model-selector.props';
import ModelSelectorCostBadge from '@ui/dropdowns/model-selector/ModelSelectorCostBadge';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import { CommandItem } from '@ui/primitives/command';
import { memo, useCallback } from 'react';
import { HiStar } from 'react-icons/hi2';

const ModelSelectorModelItem = memo(function ModelSelectorModelItem({
  option,
  isSelected,
  onToggle,
  onFavoriteToggle,
}: ModelSelectorModelItemProps) {
  const {
    model,
    brandIcon: BrandIcon,
    brandLabel,
    brandColor,
    costTier,
    isFavorite,
    variantLabel,
  } = option;

  const handleSelect = useCallback(() => {
    onToggle(model.key);
  }, [onToggle, model.key]);

  const handleFavoriteClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onFavoriteToggle(model.key);
    },
    [onFavoriteToggle, model.key],
  );

  return (
    <CommandItem
      value={`${model.label} ${brandLabel} ${model.description ?? ''}`}
      onSelect={handleSelect}
      className={cn(
        'flex min-h-11 cursor-pointer items-start gap-2 px-2 py-2 lg:min-h-0',
        isSelected && 'bg-accent',
      )}
    >
      <div className="pointer-events-none mt-0.5">
        <Checkbox
          name={`model-${model.key}`}
          isChecked={isSelected}
          onChange={() => {}}
          className="size-3.5 !border-border data-[state=checked]:!border-foreground data-[state=checked]:!bg-foreground data-[state=checked]:!text-background"
        />
      </div>

      <div
        className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm border border-border text-[9px] font-bold"
        style={{ backgroundColor: `${brandColor}20`, color: brandColor }}
      >
        {BrandIcon ? (
          <BrandIcon
            className="size-2.5"
            data-testid="model-option-provider-icon"
          />
        ) : (
          brandLabel.charAt(0)
        )}
      </div>

      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium truncate">{variantLabel}</span>
          <ModelSelectorCostBadge costTier={costTier} />
          {option.isDeprecated && (
            <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-300">
              Legacy
            </span>
          )}
        </div>
        {model.description ? (
          <span className="text-xs text-foreground/50 truncate">
            {model.description}
          </span>
        ) : model.label !== variantLabel ? (
          <span className="text-xs text-foreground/50 truncate">
            {model.label}
          </span>
        ) : null}
      </div>

      <Button
        ariaLabel={`${isFavorite ? 'Remove' : 'Add'} ${model.label} ${isFavorite ? 'from' : 'to'} favorites`}
        variant={ButtonVariant.UNSTYLED}
        withWrapper={false}
        onClick={handleFavoriteClick}
        className={cn(
          '-my-2 mt-0.5 flex size-11 shrink-0 items-center justify-center rounded transition-colors hover:bg-accent lg:my-0 lg:size-7',
          isFavorite
            ? 'text-foreground'
            : 'text-foreground/20 hover:text-foreground/40',
        )}
      >
        <HiStar className={cn('size-3.5', isFavorite && 'fill-current')} />
      </Button>
    </CommandItem>
  );
});

export default ModelSelectorModelItem;
