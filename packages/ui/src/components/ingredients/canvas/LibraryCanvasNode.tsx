'use client';

import { canOptimizeImageSource } from '@genfeedai/utils/media/image-optimization.util';
import { isVideoIngredient } from '@genfeedai/utils/media/ingredient-type.util';
import {
  MOOD_BOARD_DEFAULT_ASPECT_RATIO,
  MOOD_BOARD_TILE_WIDTH,
} from '@genfeedai/utils/moodboard/mood-board-layout.util';
import Image from 'next/image';
import { memo, useState } from 'react';
import type { LibraryCanvasNodeProps } from './library-canvas.types';

function resolveAspectRatio(width?: number, height?: number): number {
  if (typeof width === 'number' && typeof height === 'number' && height > 0) {
    return width / height;
  }
  return MOOD_BOARD_DEFAULT_ASPECT_RATIO;
}

function PlayBadge(): React.JSX.Element {
  return (
    <div
      data-testid="library-canvas-play-badge"
      className={
        'absolute right-2 bottom-2 flex h-7 w-7 items-center justify-center rounded-md bg-black/55 text-white backdrop-blur-sm' /* design-system-allow-content-color -- media overlay */
      }
    >
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="currentColor"
        role="img"
        aria-label="Video"
      >
        <title>Video</title>
        <path d="M8 5v14l11-7z" />
      </svg>
    </div>
  );
}

function LibraryCanvasNodeComponent({
  data,
}: LibraryCanvasNodeProps): React.JSX.Element {
  const { ingredient } = data;
  const isVideo = isVideoIngredient(ingredient);

  const aspectRatio = resolveAspectRatio(
    ingredient.metadataWidth,
    ingredient.metadataHeight,
  );

  // Videos show their poster on the canvas; playback happens in the lightbox.
  const src = isVideo
    ? ingredient.thumbnailUrl || ingredient.ingredientUrl
    : ingredient.ingredientUrl || ingredient.thumbnailUrl;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showPreview = Boolean(src) && failedSrc !== src;

  return (
    <div
      className="group relative cursor-pointer overflow-hidden rounded-xl border border-border bg-secondary shadow-sm transition-colors hover:border-border-strong gen-contact-sheet"
      style={{ aspectRatio, width: MOOD_BOARD_TILE_WIDTH }}
    >
      {showPreview && src ? (
        <Image
          src={src}
          alt={ingredient.metadataLabel || ingredient.promptText || 'asset'}
          fill
          unoptimized={!canOptimizeImageSource(src)}
          sizes={`${MOOD_BOARD_TILE_WIDTH}px`}
          className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          draggable={false}
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs text-foreground/40">
          No preview
        </div>
      )}
      {isVideo && <PlayBadge />}
    </div>
  );
}

export const LibraryCanvasNode = memo(LibraryCanvasNodeComponent);
