'use client';

import {
  ButtonSize,
  ButtonVariant,
  IngredientStatus,
} from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import {
  getIngredientFailureReason,
  isFailedIngredient,
} from '@genfeedai/utils/media/ingredient-ledger.util';
import { getIngredientDisplayLabel } from '@genfeedai/utils/media/ingredient-type.util';
import DropdownStatus from '@ui/dropdowns/status/DropdownStatus';
import MasonryFailureNotice from '@ui/masonry/shared/MasonryFailureNotice';
import MasonrySelectionToggle from '@ui/masonry/shared/MasonrySelectionToggle';
import { Button } from '@ui/primitives/button';
import { hoverRevealClassName } from '@ui/styles/hover-reveal';
import { SELECTED_CARD_CLASS } from '@ui/styles/selected-card';
import { Maximize2 } from 'lucide-react';
import type { MouseEvent } from 'react';
import type { IngredientTileFrameProps } from '@/props/content/ingredient.props';

/**
 * The card around a Library audio, voice or text tile. It carries what an
 * image tile carries besides its picture: the selection toggle, the status
 * and retry notices, and the click that opens the asset in the inspector.
 */
export default function IngredientTileFrame({
  children,
  ingredient,
  isActionsEnabled = true,
  isSelected = false,
  onClickIngredient,
  onRefresh,
  onReprompt,
  onToggleSelection,
}: IngredientTileFrameProps) {
  const isProcessing = ingredient.status === IngredientStatus.PROCESSING;
  const isFailed = isFailedIngredient(ingredient);
  const label = getIngredientDisplayLabel(ingredient) || 'Untitled asset';

  const handleInspect = (event: MouseEvent<HTMLElement>) => {
    // Controls inside the tile (play, scrub, select, retry) keep their click.
    if (
      event.target instanceof Element &&
      event.target.closest('button, a, input, [role="slider"]')
    ) {
      return;
    }
    onClickIngredient?.(ingredient);
  };

  return (
    // ui-guard-allow:clickable-element -- pointer shortcut that opens the inspector; the "Open details" button is the keyboard path
    <div
      className={cn(
        'group/tile relative w-full overflow-hidden rounded-card bg-card shadow-border',
        onClickIngredient && 'cursor-pointer',
        isSelected && SELECTED_CARD_CLASS,
      )}
      data-masonry-item="true"
      data-motion={isSelected ? 'allow' : undefined}
      data-selected={isSelected ? 'true' : 'false'}
      onClick={handleInspect}
    >
      {children}

      {isActionsEnabled && onToggleSelection ? (
        <MasonrySelectionToggle
          ingredient={ingredient}
          isSelected={isSelected}
          onToggleSelection={onToggleSelection}
        />
      ) : null}

      {onClickIngredient ? (
        <div
          className={cn(
            'absolute top-2 right-2 z-20 transition-opacity duration-200',
            hoverRevealClassName({ focus: 'within' }),
          )}
        >
          <Button
            ariaLabel={`Open details for ${label}`}
            className="size-6 rounded-full bg-background/90 shadow-border backdrop-blur"
            onClick={() => onClickIngredient(ingredient)}
            size={ButtonSize.ICON}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          >
            <Maximize2 aria-hidden="true" className="size-3.5" />
          </Button>
        </div>
      ) : null}

      {isProcessing ? (
        <div
          className={
            'pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-black/20 backdrop-blur-sm' /* design-system-allow-content-color -- media overlay */
          }
        >
          <div
            className="pointer-events-auto max-w-full px-2"
            onClick={(event) => event.stopPropagation()}
            role="presentation"
          >
            <DropdownStatus
              entity={ingredient}
              isStacked
              onStatusChange={onRefresh}
            />
          </div>
        </div>
      ) : null}

      {isFailed ? (
        <MasonryFailureNotice
          failureReason={getIngredientFailureReason(ingredient)}
          ingredientId={ingredient.id}
          onRetry={onReprompt ? () => onReprompt(ingredient) : undefined}
          overlayClassName="rounded-card"
        />
      ) : null}
    </div>
  );
}
