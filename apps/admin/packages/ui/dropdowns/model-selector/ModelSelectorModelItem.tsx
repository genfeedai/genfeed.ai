'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import type { ModelSelectorModelItemProps } from '@props/ui/model-selector/model-selector.props';
import Button from '@ui/buttons/base/Button';
import ModelSelectorCostBadge from '@ui/dropdowns/model-selector/ModelSelectorCostBadge';
import FormCheckbox from '@ui/forms/selectors/checkbox/form-checkbox/FormCheckbox';
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
        'flex items-start gap-2 px-2 py-2 cursor-pointer',
        isSelected && 'bg-primary/10',
      )}
    >
      <div className="pointer-events-none mt-0.5">
        <FormCheckbox
          name={`model-${model.key}`}
          isChecked={isSelected}
          onChange={() => {}}
          className="h-3.5 w-3.5 !border-white/20 data-[state=checked]:!bg-blue-500 data-[state=checked]:!border-blue-500 data-[state=checked]:!text-white"
        />
      </div>

      <div
        className="mt-0.5 h-4 w-4 rounded-sm flex items-center justify-center text-[9px] font-bold shrink-0 border border-white/8"
        style={{ backgroundColor: `${brandColor}20`, color: brandColor }}
      >
        {BrandIcon ? (
          <BrandIcon
            className="h-2.5 w-2.5"
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
        variant={ButtonVariant.UNSTYLED}
        withWrapper={false}
        onClick={handleFavoriteClick}
        className={cn(
          'mt-0.5 p-0.5 rounded hover:bg-white/10 transition-colors shrink-0',
          isFavorite
            ? 'text-yellow-400'
            : 'text-foreground/20 hover:text-foreground/40',
        )}
      >
        <HiStar className={cn('h-3.5 w-3.5', isFavorite && 'fill-current')} />
      </Button>
    </CommandItem>
  );
});

export default ModelSelectorModelItem;
