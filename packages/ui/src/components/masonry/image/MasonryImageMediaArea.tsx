'use client';

import { ButtonSize, ButtonVariant, ComponentSize } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { IImage, IMetadata } from '@genfeedai/interfaces';
import DropdownStatus from '@ui/dropdowns/status/DropdownStatus';
import Spinner from '@ui/feedback/spinner/Spinner';
import { Button } from '@ui/primitives/button';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import type { MouseEvent, SyntheticEvent } from 'react';

const BLUR_PLACEHOLDER =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAhEAACAQMDBQAAAAAAAAAAAAABAgMABAUGIWEREiMxUf/EABUBAQEAAAAAAAAAAAAAAAAAAAMF/8QAGhEAAgIDAAAAAAAAAAAAAAAAAAECEgMRkf/aAAwDAQACEQMRAD8AltJagyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyJckliyjqTzSlT54b6bk+h0R//2Q==';
const MASONRY_TILE_RADIUS_CLASS = 'rounded-lg';

type MasonryImageMediaAreaProps = {
  image: IImage;
  metadata: IMetadata | undefined;
  isLoading: boolean;
  imageError: boolean;
  isProcessing: boolean;
  isFailed: boolean;
  failureReason: string | null;
  isFleetNsfwLocked: boolean;
  isSquare: boolean;
  aspectRatioStyle: React.CSSProperties | undefined;
  imageSrc: string;
  handleImageLoad: (event: SyntheticEvent<HTMLImageElement>) => void;
  handleImageError: () => void;
  handleContentClick: (e: MouseEvent<HTMLElement>) => void;
  onRefresh?: () => void;
  onReprompt?: (image: IImage) => void;
};

export default function MasonryImageMediaArea({
  image,
  metadata,
  isLoading,
  imageError,
  isProcessing,
  isFailed,
  failureReason,
  isFleetNsfwLocked,
  isSquare,
  aspectRatioStyle,
  imageSrc,
  handleImageLoad,
  handleImageError,
  handleContentClick,
  onRefresh,
  onReprompt,
}: MasonryImageMediaAreaProps): React.ReactElement {
  const translate = useTranslations('common.libraryRetry');
  const mediaState = imageError
    ? 'fallback'
    : isProcessing
      ? 'processing'
      : isLoading
        ? 'loading'
        : 'ready';

  return (
    <>
      <Button
        aria-label={imageError ? 'Asset preview unavailable' : undefined}
        data-asset-media-state={mediaState}
        data-testid={`masonry-ingredient-${image.id}`}
        className={cn(
          'relative size-full cursor-pointer overflow-hidden bg-card shadow-border transition-shadow duration-200 hover:shadow-border-strong',
          isFleetNsfwLocked && 'cursor-not-allowed',
          MASONRY_TILE_RADIUS_CLASS,
        )}
        onClick={handleContentClick}
        type="button"
        variant={ButtonVariant.UNSTYLED}
        withWrapper={false}
      >
        {isLoading && (
          <div
            className={cn(
              'absolute inset-0 masonry-skeleton rounded-lg',
              isSquare && 'aspect-square',
            )}
            style={aspectRatioStyle}
          >
            <div
              className={
                'absolute inset-0 flex items-center justify-center bg-black/20' /* design-system-allow-content-color -- media overlay */
              }
            >
              <Spinner
                size={ComponentSize.SM}
                className={
                  'text-white' /* design-system-allow-content-color -- media overlay */
                }
              />
            </div>
          </div>
        )}

        <Image
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          onLoad={handleImageLoad}
          onError={handleImageError}
          loading={imageError ? 'eager' : 'lazy'}
          placeholder="blur"
          blurDataURL={BLUR_PLACEHOLDER}
          alt={image.promptText || 'Image'}
          // Next/Image rejects non-positive dimensions; clamp so a broken
          // metadata payload cannot throw into the ErrorBoundary on click.
          width={Math.max(1, metadata?.width || 1080)}
          height={Math.max(1, metadata?.height || 1920)}
          className={cn(
            'size-full transition-opacity duration-300',
            (isProcessing || isFailed || isFleetNsfwLocked) && 'blur-sm',
            isSquare ? 'object-cover object-center' : 'object-contain',
            isLoading ? 'opacity-0' : 'opacity-100',
          )}
          src={imageSrc}
        />

        {imageError && (
          <div
            aria-live="polite"
            className="absolute inset-x-3 bottom-3 rounded-lg bg-secondary/90 px-3 py-2 text-center text-xs font-medium text-foreground/70 shadow-dropdown"
            data-testid={`asset-media-fallback-${image.id}`}
            role="status"
          >
            Preview unavailable
          </div>
        )}

        {isFleetNsfwLocked && (
          <div
            className={
              'absolute inset-0 flex items-center justify-center bg-black/35 px-4 text-center backdrop-blur-sm' /* design-system-allow-content-color -- media overlay */
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
      </Button>

      {isProcessing && (
        <div
          className={
            'pointer-events-none absolute inset-0 z-50 flex items-center justify-center rounded-lg bg-black/20 backdrop-blur-sm' /* design-system-allow-content-color -- media overlay */
          }
        >
          <div
            role="presentation"
            className="pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <DropdownStatus
              entity={image}
              onStatusChange={onRefresh}
              className="scale-110"
            />
          </div>
        </div>
      )}

      {isFailed && onReprompt && (
        <div
          className={
            'pointer-events-none absolute inset-0 z-50 flex flex-col items-center justify-center gap-2 rounded-lg bg-black/45 px-4 text-center backdrop-blur-sm' /* design-system-allow-content-color -- media overlay */
          }
          data-testid={`asset-failure-overlay-${image.id}`}
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
              onClick={() => onReprompt(image)}
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
          className="pointer-events-none absolute inset-x-3 bottom-3 rounded-lg bg-secondary/90 px-3 py-2 text-center text-xs font-medium text-foreground/70 shadow-dropdown"
          data-testid={`asset-failure-reason-${image.id}`}
          role="status"
        >
          <span className="line-clamp-2">
            {failureReason ?? translate('genericFailureReason')}
          </span>
        </div>
      )}
    </>
  );
}
