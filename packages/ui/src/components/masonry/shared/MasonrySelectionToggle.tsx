'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { Check } from 'lucide-react';
import type { MouseEvent } from 'react';

type MasonrySelectionToggleProps<T extends IIngredient> = {
  ingredient: T;
  isSelected: boolean;
  onToggleSelection: (ingredient: T) => void;
};

/**
 * The only chrome an idle tile shows besides the overflow menu. Selection is the
 * one action worth a dedicated hit target; everything else lives in the menu.
 */
export default function MasonrySelectionToggle<T extends IIngredient>({
  ingredient,
  isSelected,
  onToggleSelection,
}: MasonrySelectionToggleProps<T>): React.ReactElement {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    event.preventDefault();
    onToggleSelection(ingredient);
  };

  return (
    <div
      className={cn(
        'quick-actions-wrapper absolute top-2 left-2 z-50 transition-opacity duration-200 focus-within:opacity-100',
        isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
      )}
      role="presentation"
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <Button
        ariaLabel={isSelected ? 'Deselect asset' : 'Select asset'}
        aria-pressed={isSelected}
        className={cn(
          'flex size-5 items-center justify-center rounded-full border transition-colors',
          isSelected
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-white/70 bg-black/40 text-transparent backdrop-blur-sm hover:border-white' /* design-system-allow-content-color -- media overlay */,
        )}
        data-testid={`masonry-select-${ingredient.id}`}
        onClick={handleClick}
        type="button"
        variant={ButtonVariant.UNSTYLED}
        withWrapper={false}
      >
        <Check className="size-3" strokeWidth={3} />
      </Button>
    </div>
  );
}
