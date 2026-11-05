'use client';

import {
  CardGap,
  CardPadding,
  CardVariant,
  formatEnumLabel,
} from '@genfeedai/contracts';
import type { ModalPostBatchIngredientPreviewProps } from '@genfeedai/props/modals/modal.props';
import Card from '@ui/card/Card';
import { useTranslations } from 'next-intl';
import IngredientThumbnail from '@/components/ingredients/ingredient-thumbnail/IngredientThumbnail';

/**
 * The asset being scheduled, as one compact row at the top of the form: its
 * thumbnail, its name, and its type and format.
 */
export default function ModalPostBatchIngredientPreview({
  ingredient,
}: ModalPostBatchIngredientPreviewProps) {
  const translate = useTranslations('ui.postBatch.asset');
  const name = ingredient.metadataLabel?.trim() || translate('untitled');
  const details = [
    formatEnumLabel(ingredient.category),
    ingredient.ingredientFormat
      ? formatEnumLabel(ingredient.ingredientFormat)
      : null,
  ].filter(Boolean);

  return (
    <Card
      bodyClassName="flex-row items-center"
      gap={CardGap.MD}
      padding={CardPadding.SM}
      variant={CardVariant.BORDERED}
    >
      <div className="relative size-14 shrink-0 overflow-hidden rounded-md">
        <IngredientThumbnail
          alt={translate('thumbnail', { name })}
          className="object-cover"
          ingredient={ingredient}
          sizes="56px"
        />
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-medium">{name}</span>
        <span className="truncate text-xs text-foreground/60">
          {details.join(' · ')}
        </span>
      </div>
    </Card>
  );
}
