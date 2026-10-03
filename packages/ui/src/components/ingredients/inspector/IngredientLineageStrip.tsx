'use client';

import {
  ButtonVariant,
  IngredientLineageDirection,
} from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useAuthorizedMediaPreview } from '@genfeedai/hooks/media/use-authorized-media-preview';
import type {
  IngredientLineageItemProps,
  IngredientLineageStripProps,
} from '@genfeedai/props/content/ingredient.props';
import { canOptimizeImageSource } from '@genfeedai/utils/media/image-optimization.util';
import {
  getIngredientPreviewUrl,
  isRasterPreviewUrl,
} from '@genfeedai/utils/media/ingredient-preview.util';
import IngredientOriginBadge from '@ui/ingredients/ingredient-origin-badge';
import LibraryAssetTypeBadge from '@ui/ingredients/library-asset-type-badge';
import { Button } from '@ui/primitives/button';
import { ImageOff } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';

import { useIngredientLineage } from './use-ingredient-lineage';

const SECTION_LABEL_KEYS: Record<
  IngredientLineageDirection,
  'madeFrom' | 'usedIn'
> = {
  [IngredientLineageDirection.MADE_FROM]: 'madeFrom',
  [IngredientLineageDirection.USED_IN]: 'usedIn',
};

function IngredientLineageItem({ ingredient }: IngredientLineageItemProps) {
  const translate = useTranslations('pages.library.inspector');
  const isTrashed = ingredient.isDeleted === true;
  const grant = useAuthorizedMediaPreview(isTrashed ? null : ingredient);
  const previewUrl = isTrashed
    ? undefined
    : grant
      ? isRasterPreviewUrl(grant.url)
        ? grant.url
        : undefined
      : getIngredientPreviewUrl(ingredient);
  const label = isTrashed
    ? translate('deletedReference')
    : ingredient.metadataLabel || translate('untitled');

  return (
    <li className="flex w-24 shrink-0 flex-col gap-1.5">
      <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-md bg-foreground/4">
        {previewUrl ? (
          <Image
            alt={label}
            className="object-cover outline-media"
            fill
            sizes="96px"
            src={previewUrl}
            unoptimized={!canOptimizeImageSource(previewUrl)}
          />
        ) : (
          <ImageOff aria-hidden="true" className="size-5 text-foreground/30" />
        )}
      </div>
      <span
        className={cn(
          'truncate text-xs',
          isTrashed ? 'italic text-foreground/45' : 'text-foreground/78',
        )}
        title={label}
      >
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-1">
        {isTrashed ? null : (
          <LibraryAssetTypeBadge category={ingredient.category} />
        )}
        <IngredientOriginBadge origin={ingredient.origin} />
      </div>
    </li>
  );
}

/**
 * One strip of an asset's lineage: the references it was made from, or the
 * outputs that used it. It renders nothing when there is nothing to show, so an
 * upload with no outputs yet does not carry two empty headings.
 */
export default function IngredientLineageStrip({
  className,
  direction,
  ingredientId,
}: IngredientLineageStripProps) {
  const translate = useTranslations('pages.library.inspector');
  const { hasError, hasNext, hiddenCount, isLoading, items, loadMore } =
    useIngredientLineage(ingredientId, direction);

  if (!hasError && !isLoading && items.length === 0 && hiddenCount === 0) {
    return null;
  }

  if (isLoading && items.length === 0) {
    return null;
  }

  return (
    <section
      aria-label={translate(SECTION_LABEL_KEYS[direction])}
      className={cn('flex min-w-0 flex-col gap-2', className)}
    >
      <h4 className="text-2xs uppercase tracking-[0.12em] text-foreground/35">
        {translate(SECTION_LABEL_KEYS[direction])}
      </h4>

      {hasError && items.length === 0 ? (
        <p className="text-xs text-foreground/45" role="alert">
          {translate('lineageError')}
        </p>
      ) : (
        <ul className="flex min-w-0 gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {items.map((item) => (
            <IngredientLineageItem ingredient={item} key={item.id} />
          ))}
        </ul>
      )}

      {hiddenCount > 0 ? (
        <p className="text-xs text-foreground/45">
          {translate('hiddenCount', { count: hiddenCount })}
        </p>
      ) : null}

      {hasNext ? (
        <Button
          className="w-fit text-xs"
          isLoading={isLoading}
          onClick={loadMore}
          type="button"
          variant={ButtonVariant.GHOST}
        >
          {translate('showMore')}
        </Button>
      ) : null}
    </section>
  );
}
