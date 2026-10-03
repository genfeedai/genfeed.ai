'use client';

import {
  ComponentSize,
  INGREDIENT_ORIGIN_LABELS,
  IngredientOrigin,
} from '@genfeedai/contracts';
import type { IngredientOriginBadgeProps } from '@genfeedai/props/content/ingredient.props';
import Badge from '@ui/display/badge/Badge';

const ORIGIN_VARIANTS: Record<
  IngredientOrigin,
  'info' | 'warning' | 'success' | 'slate'
> = {
  [IngredientOrigin.UPLOADED]: 'success',
  [IngredientOrigin.GENERATED]: 'info',
  [IngredientOrigin.IMPORTED]: 'warning',
  [IngredientOrigin.UNKNOWN]: 'slate',
};

/**
 * The permanent origin of a Library asset. The label is always text, so color
 * is never the only signal.
 */
export default function IngredientOriginBadge({
  className,
  origin,
}: IngredientOriginBadgeProps) {
  if (!origin) {
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
