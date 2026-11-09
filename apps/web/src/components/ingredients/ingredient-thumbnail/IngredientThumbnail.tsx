'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useAuthorizedMediaPreview } from '@genfeedai/hooks/media/use-authorized-media-preview';
import { canOptimizeImageSource } from '@genfeedai/utils/media/image-optimization.util';
import {
  getIngredientPreviewUrl,
  isRasterPreviewUrl,
} from '@genfeedai/utils/media/ingredient-preview.util';
import { isVideoIngredient } from '@genfeedai/utils/media/ingredient-type.util';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import { SimpleTooltip } from '@ui/primitives/tooltip';
import { ImageOff } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';
import type { IngredientThumbnailProps } from '@/props/content/ingredient.props';

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
  // A video's grant is the playable file, never a poster: show its first
  // frame instead of treating the file as a broken image.
  const videoSrc =
    grant?.url && isVideoIngredient(ingredient ?? null) ? grant.url : undefined;
  const src = grant
    ? isRasterPreviewUrl(grant.url)
      ? grant.url
      : undefined
    : getIngredientPreviewUrl(ingredient);
  // A URL can resolve and still fail to load (a video file, an expired grant);
  // the browser would then print the alt text in place of the image.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (videoSrc && failedSrc !== videoSrc) {
    return (
      <span
        className={cn(
          'block overflow-hidden',
          size === undefined ? 'absolute inset-0' : 'shrink-0',
        )}
        data-testid={testId}
        style={size === undefined ? undefined : { height: size, width: size }}
        title={title}
      >
        <VideoPlayer
          ariaLabel={alt}
          config={{
            autoPlay: false,
            controls: false,
            loop: false,
            muted: true,
            playsInline: true,
            preload: 'metadata',
          }}
          mediaClassName={cn('object-cover', className)}
          mediaProps={{
            onError: () => setFailedSrc(videoSrc),
            tabIndex: -1,
          }}
          src={`${videoSrc.split('#')[0]}#t=0.001`}
        />
      </span>
    );
  }

  if (!src || failedSrc === src) {
    return (
      <SimpleTooltip label={title}>
        <span
          aria-label={alt}
          className={cn(
            'flex items-center justify-center bg-tertiary text-muted-foreground',
            size === undefined ? 'absolute inset-0' : 'aspect-square shrink-0',
            className,
          )}
          data-testid={testId}
          role="img"
        >
          <ImageOff aria-hidden="true" className="size-2/3 min-h-3 min-w-3" />
        </span>
      </SimpleTooltip>
    );
  }

  return (
    <Image
      alt={alt}
      className={className}
      data-testid={testId}
      onError={() => setFailedSrc(src)}
      src={src}
      title={title}
      unoptimized={!canOptimizeImageSource(src)}
      {...(size === undefined
        ? { fill: true, priority: isPriority, sizes }
        : { height: size, priority: isPriority, width: size })}
    />
  );
}
