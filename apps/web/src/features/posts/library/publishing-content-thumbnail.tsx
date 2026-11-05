'use client';

import { canOptimizeImageSource } from '@genfeedai/utils/media/image-optimization.util';
import { Play } from 'lucide-react';
import Image from 'next/image';
import IngredientThumbnail from '@/components/ingredients/ingredient-thumbnail/IngredientThumbnail';
import type { PublishingContentThumbnailProps } from '@/features/posts/props/publishing-content-entry.props';

/**
 * The first media item of a Posts library row, at a fixed square size so every
 * row lines up. A text-only post shows a text mark instead.
 */
export default function PublishingContentThumbnail({
  media,
}: PublishingContentThumbnailProps) {
  return (
    <div className="relative size-12 shrink-0 overflow-hidden rounded-md bg-tertiary">
      {media === null ? (
        <span
          aria-hidden="true"
          className="flex size-full items-center justify-center text-xs font-medium text-muted-foreground"
        >
          Aa
        </span>
      ) : 'ingredient' in media ? (
        <IngredientThumbnail
          alt=""
          className="object-cover"
          ingredient={media.ingredient}
          sizes="48px"
        />
      ) : (
        <Image
          alt=""
          className="object-cover"
          fill
          sizes="48px"
          src={media.url}
          unoptimized={!canOptimizeImageSource(media.url)}
        />
      )}
      {media?.isVideo ? (
        <Play
          aria-hidden="true"
          className="absolute bottom-1 left-1 size-3.5 fill-white text-white drop-shadow"
        />
      ) : null}
    </div>
  );
}
