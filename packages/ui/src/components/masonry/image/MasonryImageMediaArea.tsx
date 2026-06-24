'use client';

import { ComponentSize } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { IImage, IMetadata } from '@genfeedai/interfaces';
import DropdownStatus from '@ui/dropdowns/status/DropdownStatus';
import Spinner from '@ui/feedback/spinner/Spinner';
import Image from 'next/image';
import type { MouseEvent } from 'react';

const BLUR_PLACEHOLDER =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAhEAACAQMDBQAAAAAAAAAAAAABAgMABAUGIWEREiMxUf/EABUBAQEAAAAAAAAAAAAAAAAAAAMF/8QAGhEAAgIDAAAAAAAAAAAAAAAAAAECEgMRkf/aAAwDAQACEQMRAD8AltJagyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyJckliyjqTzSlT54b6bk+h0R//2Q==';
const MASONRY_TILE_RADIUS_CLASS = 'rounded-lg';

type MasonryImageMediaAreaProps = {
  image: IImage;
  metadata: IMetadata | undefined;
  isLoading: boolean;
  imageError: boolean;
  isProcessing: boolean;
  isDarkroomLocked: boolean;
  isSquare: boolean;
  aspectRatioStyle: React.CSSProperties | undefined;
  imageSrc: string;
  handleImageLoad: () => void;
  handleImageError: () => void;
  handleContentClick: (e: MouseEvent<HTMLElement>) => void;
  onRefresh?: () => void;
};

export default function MasonryImageMediaArea({
  image,
  metadata,
  isLoading,
  imageError,
  isProcessing,
  isDarkroomLocked,
  isSquare,
  aspectRatioStyle,
  imageSrc,
  handleImageLoad,
  handleImageError,
  handleContentClick,
  onRefresh,
}: MasonryImageMediaAreaProps): React.ReactElement {
  const mediaState = imageError
    ? 'fallback'
    : isProcessing
      ? 'processing'
      : isLoading
        ? 'loading'
        : 'ready';

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-label={imageError ? 'Asset preview unavailable' : undefined}
        data-asset-media-state={mediaState}
        data-testid={`masonry-ingredient-${image.id}`}
        className={cn(
          'relative size-full cursor-pointer overflow-hidden border border-white/[0.08] bg-card transition-[border-color,background-color] duration-200 hover:border-white/[0.14]',
          isDarkroomLocked && 'cursor-not-allowed',
          MASONRY_TILE_RADIUS_CLASS,
        )}
        onClick={handleContentClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleContentClick(e as unknown as MouseEvent<HTMLElement>);
          }
        }}
      >
        {isLoading && (
          <div
            className={cn(
              'absolute inset-0 masonry-skeleton rounded-lg',
              isSquare && 'aspect-square',
            )}
            style={aspectRatioStyle}
          >
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <Spinner size={ComponentSize.SM} className="text-white" />
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
          width={metadata?.width || 1080}
          height={metadata?.height || 1920}
          className={cn(
            'size-full transition-opacity duration-300',
            (isProcessing || isDarkroomLocked) && 'blur-sm',
            isSquare ? 'object-cover object-center' : 'object-contain',
            isLoading ? 'opacity-0' : 'opacity-100',
          )}
          src={imageSrc}
        />

        {imageError && (
          <div
            aria-live="polite"
            className="absolute inset-x-3 bottom-3 rounded-md border border-white/15 bg-black/70 px-3 py-2 text-center text-xs font-medium text-white shadow-lg backdrop-blur-sm"
            data-testid={`asset-media-fallback-${image.id}`}
            role="status"
          >
            Preview unavailable
          </div>
        )}

        {isDarkroomLocked && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/35 backdrop-blur-sm px-4 text-center">
            <div className="rounded-full border border-white/20 bg-black/50 px-3 py-1 text-xs font-medium text-white">
              Sensitive darkroom asset
            </div>
          </div>
        )}
      </div>

      {isProcessing && (
        <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none rounded-lg bg-black/20 backdrop-blur-sm">
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
    </>
  );
}
