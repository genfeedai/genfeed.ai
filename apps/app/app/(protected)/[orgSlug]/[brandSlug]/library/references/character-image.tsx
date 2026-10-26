'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useAuthorizedMediaPreview } from '@genfeedai/hooks/media/use-authorized-media-preview';
import { canOptimizeImageSource } from '@genfeedai/utils/media/image-optimization.util';
import {
  getIngredientPreviewUrl,
  isRasterPreviewUrl,
} from '@genfeedai/utils/media/ingredient-preview.util';
import type { CharacterImageProps } from '@props/characters/characters-page.props';
import { ImageOff } from 'lucide-react';
import Image from 'next/image';

/** A character avatar or reference, shown through the media grant the API issues. */
export default function CharacterImage({
  alt,
  className,
  ingredient,
  size,
  title,
}: CharacterImageProps) {
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
          'flex shrink-0 items-center justify-center bg-background-tertiary text-muted-foreground',
          className,
        )}
        role="img"
        style={{ height: size, width: size }}
        title={title}
      >
        <ImageOff aria-hidden="true" className="size-4" />
      </span>
    );
  }

  return (
    <Image
      alt={alt}
      className={className}
      height={size}
      src={src}
      title={title}
      unoptimized={!canOptimizeImageSource(src)}
      width={size}
    />
  );
}
