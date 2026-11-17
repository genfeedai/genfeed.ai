'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { IngredientsService } from '@genfeedai/services/content/ingredients.service';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useTranslations } from 'next-intl';
import type { IngredientStackStripProps } from '@/props/content/ingredient.props';
import { IngredientLineageItem } from './IngredientLineageStrip';

function createIngredientsService(token: string): IngredientsService {
  return IngredientsService.getInstance(token);
}

const NO_SLIDES: IIngredient[] = [];

/**
 * The carousel an asset belongs to, every slide in post order with the cover
 * first. Nothing renders for an asset that is in no carousel. It shows the
 * same item card as the lineage strips, so a slide looks like any other
 * related asset.
 */
export default function IngredientStackStrip({
  className,
  ingredientId,
}: IngredientStackStripProps) {
  const translate = useTranslations('pages.library.inspector');
  const { data } = useAuthedQuery({
    queryFn: (service, signal) => service.getStack(ingredientId, signal),
    queryKey: ['ingredient-stack', ingredientId],
    service: createIngredientsService,
  });
  const slides = data ?? NO_SLIDES;

  if (slides.length < 2) {
    return null;
  }

  return (
    <section
      aria-label={translate('stack')}
      className={cn('flex min-w-0 flex-col gap-2', className)}
    >
      <h4 className="text-2xs uppercase tracking-label text-muted-foreground">
        {translate('stackCount', { count: slides.length })}
      </h4>
      <ul className="flex min-w-0 gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {slides.map((slide) => (
          <IngredientLineageItem ingredient={slide} key={slide.id} />
        ))}
      </ul>
    </section>
  );
}
