'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useAuthorizedMediaPreview } from '@genfeedai/hooks/media/use-authorized-media-preview';
import type { IngredientThumbnailProps } from '@genfeedai/props/content/ingredient.props';
import { canOptimizeImageSource } from '@genfeedai/utils/media/image-optimization.util';
import {
  getIngredientPreviewUrl,
  isRasterPreviewUrl,
} from '@genfeedai/utils/media/ingredient-preview.util';
import { ImageOff } from 'lucide-react';
import Image from 'next/image';

/** An image shown through the media grant the API issues, with a placeholder instead of a broken image. */
export default function IngredientThumbnail({
  alt,
  className,
  ingredient,
  isPriority,
  size,
  sizes,
  testId,
  title,
}: IngredientThumbnailProps) {
  const grant = useAuthorizedMediaPreview(ingredient ?? null);
  const src = grant
    ? isRasterPreviewUrl(grant.url)
      ? grant.url
      : undefined
    : getIngredientPreviewUrl(ingredient);

  if (!src) {
    return (
      <span
        aria-label={alt}
        className={cn(
          'flex items-center justify-center bg-tertiary text-muted-foreground',
          size === undefined ? 'absolute inset-0' : 'aspect-square shrink-0',
          className,
        )}
        data-testid={testId}
        role="img"
        title={title}
      >
        <ImageOff aria-hidden="true" className="size-2/3 min-h-3 min-w-3" />
      </span>
    );
  }

  return (
    <Image
      alt={alt}
      className={className}
      data-testid={testId}
      src={src}
      title={title}
      unoptimized={!canOptimizeImageSource(src)}
      {...(size === undefined
        ? { fill: true, priority: isPriority, sizes }
        : { height: size, priority: isPriority, width: size })}
    />
  );
}
