'use client';

import {
  INGREDIENT_ORIGIN_LABELS,
  IngredientOrigin,
} from '@genfeedai/contracts';
import { Badge } from '@ui/primitives/badge';
import type { IngredientOriginBadgeProps } from '@/props/content/ingredient.props';

const ORIGIN_VARIANTS: Record<
  Exclude<IngredientOrigin, IngredientOrigin.GENERATED>,
  'info' | 'warning' | 'success' | 'secondary'
> = {
  [IngredientOrigin.UPLOADED]: 'success',
  [IngredientOrigin.IMPORTED]: 'warning',
  [IngredientOrigin.UNKNOWN]: 'secondary',
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
    <Badge className={className} variant={ORIGIN_VARIANTS[origin]}>
      {INGREDIENT_ORIGIN_LABELS[origin]}
    </Badge>
  );
}
