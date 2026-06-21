'use client';

import { isVideoIngredient } from '@genfeedai/utils/media/ingredient-type.util';
import { MOOD_BOARD_TILE_WIDTH } from '@genfeedai/utils/moodboard/mood-board-layout.util';
import Image from 'next/image';
import { memo } from 'react';
import type { MediaAssetNodeProps } from '@/features/moodboard/moodboard.types';

const DEFAULT_ASPECT_RATIO = 4 / 5;

function resolveAspectRatio(width?: number, height?: number): number {
  if (typeof width === 'number' && typeof height === 'number' && height > 0) {
    return width / height;
  }
  return DEFAULT_ASPECT_RATIO;
}

function PlayBadge(): React.JSX.Element {
  return (
    <div
      data-testid="moodboard-play-badge"
      className="absolute right-2 bottom-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm"
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

function MediaAssetNodeComponent({
  data,
}: MediaAssetNodeProps): React.JSX.Element {
  const { ingredient } = data;
  const isVideo = isVideoIngredient(ingredient);

  const aspectRatio = resolveAspectRatio(
    ingredient.metadataWidth,
    ingredient.metadataHeight,
  );

  // Videos show their poster on the board; playback happens in the lightbox.
  const src = isVideo
    ? ingredient.thumbnailUrl || ingredient.ingredientUrl
    : ingredient.ingredientUrl || ingredient.thumbnailUrl;

  return (
    <div
      className="group relative cursor-pointer overflow-hidden rounded-xl border border-white/[0.08] bg-card shadow-sm transition-colors hover:border-white/[0.18] gen-contact-sheet"
      style={{ width: MOOD_BOARD_TILE_WIDTH, aspectRatio }}
    >
      {src ? (
        <Image
          unoptimized
          src={src}
          alt={ingredient.metadataLabel || ingredient.promptText || 'asset'}
          fill
          sizes={`${MOOD_BOARD_TILE_WIDTH}px`}
          className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          draggable={false}
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

export const MediaAssetNode = memo(MediaAssetNodeComponent);
