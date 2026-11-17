'use client';

import type { IIngredientStack } from '@genfeedai/contracts/interfaces';
import { Badge } from '@ui/primitives/badge';
import { Layers } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * Marks the cover tile of a carousel with how many images sit behind it, so a
 * six-image post reads as one tile instead of six loose ones. Nothing renders
 * for an asset that is not a cover.
 */
export default function IngredientStackBadge({
  className,
  stack,
}: {
  className?: string;
  stack: IIngredientStack | null | undefined;
}) {
  const translate = useTranslations('pages.library.stack');

  if (!stack) {
    return null;
  }

  return (
    <Badge
      aria-label={translate('count', { count: stack.count })}
      className={className}
      icon={<Layers aria-hidden="true" className="size-3.5" />}
      value={stack.count}
      variant="secondary"
    />
  );
}
