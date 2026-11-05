'use client';

import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import type { IIngredient, IMetadata } from '@genfeedai/contracts/interfaces';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { formatDuration } from '@genfeedai/helpers/video-duration.helper';
import { isFailedIngredient } from '@genfeedai/utils/media/ingredient-ledger.util';
import { hoverRevealClassName } from '@ui/styles/hover-reveal';
import IngredientReviewActions from '@/components/ingredients/IngredientReviewActions';
import IngredientOriginBadge from '@/components/ingredients/ingredient-origin-badge';
import IngredientTagChips from '@/components/ingredients/ingredient-tag-chips';
import type { IngredientTileOverlaysProps } from '@/props/content/ingredient.props';

/**
 * The hover caption: a bottom shadow that fades the media into a title, its
 * duration and its origin. A gradient, not a box, so the media stays readable.
 */
const CAPTION_CLASS = cn(
  'pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end gap-2 rounded-b-card bg-gradient-to-t from-black/80 via-black/40 to-transparent px-2.5 pb-2 pt-10 text-xs text-white transition-opacity' /* design-system-allow-content-color -- media overlay */,
  hoverRevealClassName({ isInteractive: false }),
);

function getCaption(ingredient: IIngredient): {
  duration: string | null;
  label: string | null;
} {
  const metadata =
    typeof ingredient.metadata === 'object' && ingredient.metadata
      ? (ingredient.metadata as IMetadata)
      : null;
  const label =
    metadata?.label?.trim() ||
    ingredient.metadataLabel?.trim() ||
    ingredient.promptText?.trim();
  const duration = metadata?.duration ?? ingredient.metadataDuration;

  return {
    duration: duration ? formatDuration(duration) : null,
    label: label || null,
  };
}

const CAPTIONED_CATEGORIES = new Set<string>([
  IngredientCategory.AVATAR,
  IngredientCategory.GIF,
  IngredientCategory.IMAGE,
  IngredientCategory.IMAGE_EDIT,
  IngredientCategory.VIDEO,
  IngredientCategory.VIDEO_EDIT,
]);

function isCaptionedCategory(category?: string): boolean {
  return category ? CAPTIONED_CATEGORIES.has(category) : true;
}

/** Tiles without a caption (text, audio) reveal their origin on its own. */
const ORIGIN_BADGE_CLASS = cn(
  'pointer-events-none absolute bottom-1.5 left-1.5 z-10 transition-opacity',
  hoverRevealClassName({ isInteractive: false }),
);

/** Tags sit just above the caption and never intercept a click either. */
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

  // Text and audio tiles draw their own title; the caption is for media.
  const caption =
    hasNoAsset || !isCaptionedCategory(ingredient.category)
      ? null
      : getCaption(ingredient);

  return (
    <>
      {caption ? (
        <div
          className={cn(CAPTION_CLASS, isReviewEnabled && !isFailed && 'pr-24')}
          data-testid="ingredient-tile-caption"
        >
          <IngredientOriginBadge
            className="shrink-0"
            origin={ingredient.origin}
          />
          <span className="min-w-0 flex-1 truncate font-medium">
            {caption.label}
          </span>
          {caption.duration ? (
            <span className="shrink-0 font-mono tabular-nums text-white/70">
              {caption.duration}
            </span>
          ) : null}
        </div>
      ) : null}
      <IngredientTagChips className={TAG_CHIPS_CLASS} tags={ingredient.tags} />
      {isReviewEnabled && !isFailed ? (
        <div className={REVIEW_ACTIONS_CLASS}>
          <IngredientReviewActions
            ingredient={ingredient}
            onUpdated={onReviewUpdated}
          />
        </div>
      ) : null}
      {!caption && !hasNoAsset ? (
        <IngredientOriginBadge
          className={ORIGIN_BADGE_CLASS}
          origin={ingredient.origin}
        />
      ) : null}
    </>
  );
}
