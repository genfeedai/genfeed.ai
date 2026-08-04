'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { ModelSelectorModelItemProps } from '@genfeedai/props/ui/model-selector/model-selector.props';
import ModelSelectorCostBadge from '@ui/dropdowns/model-selector/ModelSelectorCostBadge';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import { CommandItem } from '@ui/primitives/command';
import { Star } from 'lucide-react';
import { memo, useCallback } from 'react';

const ModelSelectorModelItem = memo(function ModelSelectorModelItem({
  option,
  isSelected,
  onToggle,
  onFavoriteToggle,
}: ModelSelectorModelItemProps) {
  const { model, brandLabel, costTier, isFavorite, variantLabel } = option;

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
        'flex min-h-9 cursor-pointer items-center gap-2.5 rounded-sm px-2 py-1.5 text-[13px] text-foreground transition-colors data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground lg:min-h-0',
        isSelected && 'bg-background-tertiary',
      )}
    >
      <div className="pointer-events-none flex size-5 shrink-0 items-center justify-center">
        <Checkbox
          name={`model-${model.key}`}
          isChecked={isSelected}
          onChange={() => {}}
          className="size-3.5 !border-border data-[state=checked]:!border-foreground data-[state=checked]:!bg-foreground data-[state=checked]:!text-background"
        />
      </div>

      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium">{variantLabel}</span>
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
          '-my-1.5 flex size-9 shrink-0 items-center justify-center rounded-sm transition-colors hover:bg-accent lg:my-0 lg:size-6',
          isFavorite
            ? 'text-foreground'
            : 'text-foreground/20 hover:text-foreground/40',
        )}
      >
        <Star className={cn('size-3.5', isFavorite && 'fill-current')} />
      </Button>
    </CommandItem>
  );
});

export default ModelSelectorModelItem;
