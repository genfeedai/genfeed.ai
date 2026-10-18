'use client';

import { IngredientStatus } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { IngredientTileOverlaysProps } from '@genfeedai/props/content/ingredient.props';
import { isFailedIngredient } from '@genfeedai/utils/media/ingredient-ledger.util';
import IngredientReviewActions from '@ui/ingredients/IngredientReviewActions';
import IngredientOriginBadge from '@ui/ingredients/ingredient-origin-badge';
import IngredientTagChips from '@ui/ingredients/ingredient-tag-chips';
import { hoverRevealClassName } from '@ui/styles/hover-reveal';

/** Reveal provenance with the card actions on hover or keyboard focus. */
const ORIGIN_BADGE_CLASS = cn(
  'pointer-events-none absolute bottom-1.5 left-1.5 z-10 transition-opacity',
  hoverRevealClassName({ isInteractive: false }),
);

/** Tags sit just above the origin label and never intercept a click either. */
const TAG_CHIPS_CLASS =
  'pointer-events-none absolute bottom-8 left-1.5 right-1.5 z-10';

const REVIEW_ACTIONS_CLASS = cn(
  'absolute bottom-1.5 right-1.5 z-20 transition-opacity',
  hoverRevealClassName(),
);

/**
 * The hover layer on top of a masonry tile, shared by the Library and Studio
 * grids so both surfaces show the same tags, Validate / Reject and origin.
 * Render inside a `group relative` wrapper around the tile. A failed or
 * still-generating tile has no asset to validate or label, so it carries only
 * its tags and its status notice.
 */
export default function IngredientTileOverlays({
  ingredient,
  isReviewEnabled,
  onReviewUpdated,
}: IngredientTileOverlaysProps) {
  const isFailed = isFailedIngredient(ingredient);
  const hasNoAsset =
    isFailed || ingredient.status === IngredientStatus.PROCESSING;

  return (
    <>
      <IngredientTagChips className={TAG_CHIPS_CLASS} tags={ingredient.tags} />
      {isReviewEnabled && !isFailed ? (
        <div className={REVIEW_ACTIONS_CLASS}>
          <IngredientReviewActions
            ingredient={ingredient}
            onUpdated={onReviewUpdated}
          />
        </div>
      ) : null}
      {hasNoAsset ? null : (
        <IngredientOriginBadge
          className={ORIGIN_BADGE_CLASS}
          origin={ingredient.origin}
        />
      )}
    </>
  );
}
