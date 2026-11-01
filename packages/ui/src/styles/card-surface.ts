import { CardVariant } from '@genfeedai/contracts';

/**
 * Card chrome shared by `Card` (components) and primitives that paint a card
 * surface themselves (`EmptyState surface="card"`). Primitives build to dist
 * on their own and cannot import `Card`, so the classes live here once.
 */
export const CARD_SURFACE_BASE_CLASS = 'relative rounded-card';

export const CARD_SURFACE_VARIANT_CLASSES: Record<CardVariant, string> = {
  [CardVariant.DEFAULT]: 'shadow-border bg-card text-card-foreground',
  [CardVariant.BORDERED]: 'border border-border bg-card text-card-foreground',
  [CardVariant.INSET]: 'bg-tertiary text-card-foreground',
};
