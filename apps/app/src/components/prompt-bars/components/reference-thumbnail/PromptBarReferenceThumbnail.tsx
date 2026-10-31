'use client';

import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import Image from 'next/image';
import { useMemo } from 'react';
import IngredientThumbnail from '@/components/ingredients/ingredient-thumbnail/IngredientThumbnail';
import { useIngredientsById } from '@/hooks/media/use-ingredients-by-id';
import type { PromptBarReferenceThumbnailProps } from '@/props/prompt-bars/prompt-bar-reference-thumbnail.props';

/**
 * A reference's thumbnail. Ingredient references show through the media grant
 * the API issues (re-read, so a long-open prompt bar does not keep an expired
 * URL); brand references are assets and keep their own URL.
 */
export default function PromptBarReferenceThumbnail({
  alt,
  className,
  isPriority,
  reference,
  referenceSource,
  size,
}: PromptBarReferenceThumbnailProps) {
  const isBrandReference = referenceSource === 'brand';
  const ingredients = useIngredientsById(
    useMemo(
      () => (isBrandReference ? [] : [reference.id]),
      [isBrandReference, reference.id],
    ),
  );

  if (isBrandReference) {
    return (
      <Image
        alt={alt}
        className={className}
        height={size}
        priority={isPriority}
        src={
          reference.ingredientUrl ||
          `${EnvironmentService.cdnUrl}/references/${reference.id}`
        }
        width={size}
      />
    );
  }

  // Until the ingredient is read, show what the selection already carried.
  const ingredient =
    ingredients.get(reference.id) ??
    ({
      id: reference.id,
      ingredientUrl: reference.ingredientUrl,
    } as IIngredient);

  return (
    <IngredientThumbnail
      alt={alt}
      className={className}
      ingredient={ingredient}
      isPriority={isPriority}
      size={size}
    />
  );
}
