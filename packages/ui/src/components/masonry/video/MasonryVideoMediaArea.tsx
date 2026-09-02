'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { IMetadata, IVideo } from '@genfeedai/contracts/interfaces';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import DropdownStatus from '@ui/dropdowns/status/DropdownStatus';
import { Button } from '@ui/primitives/button';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import type { DragEvent, RefObject } from 'react';

type MasonryVideoMediaAreaProps = {
  video: IVideo;
  metadata: IMetadata | null;
  isUnavailable: boolean;
  isProcessing: boolean;
  isFailed: boolean;
  failureReason: string | null;
  isFleetNsfwLocked: boolean;
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
  onReprompt?: (video: IVideo) => void;
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
  isFailed,
  failureReason,
  isFleetNsfwLocked,
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
  onReprompt,
}: MasonryVideoMediaAreaProps) {
  const translate = useTranslations('common.libraryRetry');
  const sharedWrapperProps = {
    'data-testid': `masonry-ingredient-${video.id}`,
    role: 'button' as const,
    tabIndex: 0,
    className: 'cursor-pointer relative w-full',
    draggable: isDragEnabled && hasUpdateParent,
    onDragStartCapture: handleMediaDragStart,
    style: getAspectRatioStyle(metadata),
    onClick: () => {
      if (!isFleetNsfwLocked) {
        onClickIngredient?.(video);
      }
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (!isFleetNsfwLocked) {
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
            <div
              className={
                'pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm' /* design-system-allow-content-color -- media overlay */
              }
            >
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

          {isFailed && onReprompt && (
            <div
              className={
                'pointer-events-none absolute inset-0 z-50 flex flex-col items-center justify-center gap-2 bg-black/45 px-4 text-center backdrop-blur-sm' /* design-system-allow-content-color -- media overlay */
              }
              data-testid={`asset-failure-overlay-${video.id}`}
            >
              <p
                className={
                  'line-clamp-2 text-xs font-medium text-white' /* design-system-allow-content-color -- media overlay */
                }
              >
                {failureReason ?? translate('genericFailureReason')}
              </p>
              <div
                role="presentation"
                className="pointer-events-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <Button
                  onClick={() => onReprompt(video)}
                  label={translate('retry')}
                  ariaLabel={translate('retryAriaLabel')}
                  variant={ButtonVariant.SECONDARY}
                  size={ButtonSize.SM}
                />
              </div>
            </div>
          )}

          {isFailed && !onReprompt && (
            <div
              aria-live="polite"
              className="pointer-events-none absolute inset-x-3 bottom-3 z-50 rounded-lg bg-secondary/90 px-3 py-2 text-center text-xs font-medium text-foreground/70 shadow-dropdown"
              data-testid={`asset-failure-reason-${video.id}`}
              role="status"
            >
              <span className="line-clamp-2">
                {failureReason ?? translate('genericFailureReason')}
              </span>
            </div>
          )}

          <Image
            src={placeholderImageUrl}
            alt={metadataLabel ?? 'Video'}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            className={cn(
              'object-cover object-center',
              (isFailed || isFleetNsfwLocked) && 'blur-sm',
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

      {isFleetNsfwLocked && (
        <div
          className={
            'absolute inset-0 z-40 flex items-center justify-center bg-black/35 px-4 text-center backdrop-blur-sm' /* design-system-allow-content-color -- media overlay */
          }
        >
          <div
            className={
              'rounded-full border border-white/20 bg-black/50 px-3 py-1 text-xs font-medium text-white' /* design-system-allow-content-color -- media overlay */
            }
          >
            Sensitive fleet asset
          </div>
        </div>
      )}
    </>
  );
}
