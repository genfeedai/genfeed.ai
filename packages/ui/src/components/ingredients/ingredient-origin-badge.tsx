'use client';

import {
  ComponentSize,
  INGREDIENT_ORIGIN_LABELS,
  IngredientOrigin,
} from '@genfeedai/contracts';
import type { IngredientOriginBadgeProps } from '@genfeedai/props/content/ingredient.props';
import Badge from '@ui/display/badge/Badge';

const ORIGIN_VARIANTS: Record<
  Exclude<IngredientOrigin, IngredientOrigin.GENERATED>,
  'info' | 'warning' | 'success' | 'slate'
> = {
  [IngredientOrigin.UPLOADED]: 'success',
  [IngredientOrigin.IMPORTED]: 'warning',
  [IngredientOrigin.UNKNOWN]: 'slate',
};

/**
 * The permanent origin of a Library asset. The label is always text, so color
 * is never the only signal.
 *
 * Generated is the norm in the Library, so it carries no badge; only the
 * exceptions (uploaded, imported, unknown) are marked.
 */
export default function IngredientOriginBadge({
  className,
  origin,
}: IngredientOriginBadgeProps) {
  if (!origin || origin === IngredientOrigin.GENERATED) {
    return null;
  }

  return (
    <Badge
      className={className}
      size={ComponentSize.SM}
      variant={ORIGIN_VARIANTS[origin]}
    >
      {INGREDIENT_ORIGIN_LABELS[origin]}
    </Badge>
  );
}
