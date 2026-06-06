'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { IMetadata, IVideo } from '@genfeedai/interfaces';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import DropdownStatus from '@ui/dropdowns/status/DropdownStatus';
import Image from 'next/image';
import type { DragEvent, RefObject } from 'react';

type MasonryVideoMediaAreaProps = {
  video: IVideo;
  metadata: IMetadata | null;
  isUnavailable: boolean;
  isProcessing: boolean;
  isDarkroomLocked: boolean;
  isDragEnabled: boolean;
  hasUpdateParent: boolean;
  placeholderImageUrl: string;
  thumbnailImageUrl: string;
  ingredientUrl: string;
  metadataLabel: string | undefined;
  videoRef: RefObject<HTMLVideoElement | null>;
  handleMediaDragStart: (event: DragEvent<HTMLDivElement>) => void;
  onClickIngredient?: (video: IVideo) => void;
  onRefresh?: () => void;
  onImageLoad?: () => void;
};

function getAspectRatioStyle(metadata: IMetadata | null): React.CSSProperties {
  return {
    aspectRatio:
      metadata?.width && metadata?.height
        ? `${metadata.width} / ${metadata.height}`
        : '9 / 16',
  };
}

export default function MasonryVideoMediaArea({
  video,
  metadata,
  isUnavailable,
  isProcessing,
  isDarkroomLocked,
  isDragEnabled,
  hasUpdateParent,
  placeholderImageUrl,
  thumbnailImageUrl,
  ingredientUrl,
  metadataLabel,
  videoRef,
  handleMediaDragStart,
  onClickIngredient,
  onRefresh,
  onImageLoad,
}: MasonryVideoMediaAreaProps) {
  const sharedWrapperProps = {
    'data-testid': `masonry-ingredient-${video.id}`,
    role: 'button' as const,
    tabIndex: 0,
    className: 'cursor-pointer relative w-full',
    draggable: isDragEnabled && hasUpdateParent,
    onDragStartCapture: handleMediaDragStart,
    style: getAspectRatioStyle(metadata),
    onClick: () => {
      if (!isDarkroomLocked) {
        onClickIngredient?.(video);
      }
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (!isDarkroomLocked) {
          onClickIngredient?.(video);
        }
      }
    },
  };

  return (
    <>
      {isUnavailable ? (
        <div {...sharedWrapperProps}>
          {isProcessing && (
            <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none bg-black/20 backdrop-blur-sm">
              <div
                role="presentation"
                className="pointer-events-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <DropdownStatus
                  entity={video}
                  onStatusChange={onRefresh}
                  className="scale-110"
                />
              </div>
            </div>
          )}
          <Image
            src={placeholderImageUrl}
            alt={metadataLabel ?? 'Video'}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            className={cn(
              'object-cover object-center',
              isDarkroomLocked && 'blur-sm',
            )}
            loading="lazy"
            onLoad={() => onImageLoad?.()}
          />
        </div>
      ) : (
        <div {...sharedWrapperProps}>
          <VideoPlayer
            src={
              ingredientUrl && ingredientUrl !== ''
                ? ingredientUrl
                : placeholderImageUrl
            }
            thumbnail={thumbnailImageUrl}
            videoRef={videoRef}
            className="pointer-events-none select-none"
            config={{
              autoPlay: false,
              controls: false,
              loop: true,
              muted: true,
              playsInline: true,
              preload: 'metadata',
            }}
          />
        </div>
      )}

      {isDarkroomLocked && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/35 backdrop-blur-sm px-4 text-center">
          <div className="rounded-full border border-white/20 bg-black/50 px-3 py-1 text-xs font-medium text-white">
            Sensitive darkroom asset
          </div>
        </div>
      )}
    </>
  );
}
