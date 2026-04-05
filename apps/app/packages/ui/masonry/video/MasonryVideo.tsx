'use client';

import type { IIngredient, IMetadata, IVideo } from '@genfeedai/interfaces';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonSize, ButtonVariant, IngredientStatus } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { stopAndResetVideo } from '@hooks/media/video-utils/video.utils';
import useIngredientActions from '@hooks/ui/ingredient/use-ingredient-actions/use-ingredient-actions';
import type { MasonryVideoProps } from '@props/content/masonry.props';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import Button from '@ui/buttons/base/Button';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import DraggableIngredient from '@ui/drag-drop/draggable/DraggableIngredient';
import { writeIngredientTransferData } from '@ui/drag-drop/shared/ingredient-transfer';
import DropZoneIngredient from '@ui/drag-drop/zone-ingredient/DropZoneIngredient';
import DropdownStatus from '@ui/dropdowns/status/DropdownStatus';
import MasonryBadgeOverlay from '@ui/masonry/shared/MasonryBadgeOverlay';
import MasonryBrandLogo from '@ui/masonry/shared/MasonryBrandLogo';
import MasonryConfirmBridge from '@ui/masonry/shared/MasonryConfirmBridge';
import { createDownloadHandler } from '@ui/masonry/shared/useMasonryHover';
import IngredientQuickActions from '@ui/quick-actions/actions/IngredientQuickActions';
import { SCROLL_FOCUS_SURFACE_CLASS } from '@ui/styles/scroll-focus';
import { resolveIngredientReferenceUrl } from '@utils/media/reference.util';
import Image from 'next/image';
import type { DragEvent, MouseEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HiHandThumbUp } from 'react-icons/hi2';

const MASONRY_TILE_RADIUS_CLASS = 'rounded-lg';

export default function MasonryVideo({
  video,
  isSelected = false,
  isScrollFocused = false,
  isActionsEnabled = true,
  isFormatCompatible = true,
  isPublicGallery = false,
  isPublicProfile = false,
  isPortraiting = false,
  isGeneratingCaptions = false,
  isMirroring = false,
  isReversing = false,
  availableTags,
  isLoadingTags,
  evaluationScore,
  isContainerHovered = true,
  onShareIngredient,
  onClickIngredient,
  onDeleteIngredient,
  onVoteIngredient,
  onPublishIngredient,
  onToggleFavorite,
  onCopyPrompt,
  onReprompt,
  onMarkValidated,
  onMarkRejected,
  onSeeDetails,
  onReverse,
  onMirror,
  onUpdateParent,
  onImageLoad,
  onScopeChange,
  onRefresh,
  isDragEnabled = true,
  onHoverChange,
}: MasonryVideoProps) {
  const { selectedBrand, settings } = useBrand();
  const videoRef = useRef<HTMLVideoElement>(null);
  const playTimeoutRef = useRef<NodeJS.Timeout>(null);
  const isHoveringRef = useRef(false);
  const [isHovered, setIsHovered] = useState(false);
  const [showActions, setShowActions] = useState(false);

  // URL resolution
  const referenceImageUrl = useMemo(() => {
    if ('primaryReferenceUrl' in video && video.primaryReferenceUrl) {
      return typeof video.primaryReferenceUrl === 'string'
        ? video.primaryReferenceUrl
        : '';
    }
    return resolveIngredientReferenceUrl(video.references);
  }, [video]);

  const ingredientUrl = video?.ingredientUrl ?? '';
  const explicitThumbnail = 'thumbnailUrl' in video ? video.thumbnailUrl : null;
  const isProcessing = video.status === IngredientStatus.PROCESSING;
  const isFailed = video.status === IngredientStatus.FAILED;
  const isUnavailable = isProcessing || isFailed;
  const isDarkroomSensitive =
    selectedBrand?.isDarkroomEnabled &&
    !!video.personaSlug &&
    video.contentRating !== 'sfw';
  const isDarkroomLocked =
    Boolean(isDarkroomSensitive) && !settings?.isDarkroomNsfwVisible;
  const isInteractionBlocked = isUnavailable || isDarkroomLocked;

  const placeholderImageUrl = useMemo(() => {
    if (isProcessing && referenceImageUrl && referenceImageUrl !== '') {
      return referenceImageUrl;
    }
    if (ingredientUrl && ingredientUrl !== '') {
      return ingredientUrl;
    }
    return referenceImageUrl && referenceImageUrl !== ''
      ? referenceImageUrl
      : `${EnvironmentService.assetsEndpoint}/placeholders/portrait.jpg`;
  }, [ingredientUrl, referenceImageUrl, isProcessing]);

  const thumbnailImageUrl = useMemo(() => {
    if (explicitThumbnail && explicitThumbnail !== '') {
      return explicitThumbnail;
    }

    return referenceImageUrl && referenceImageUrl !== ''
      ? referenceImageUrl
      : `${EnvironmentService.assetsEndpoint}/placeholders/portrait.jpg`;
  }, [explicitThumbnail, referenceImageUrl]);

  const metadata =
    typeof video.metadata === 'object' && video.metadata
      ? (video.metadata as IMetadata)
      : null;
  const metadataLabel = metadata?.label;

  // Shared ingredient actions
  const {
    actionStates,
    handlers,
    upscaleConfirmData,
    executeUpscale,
    clearUpscaleConfirm,
    enhanceConfirmData,
    executeEnhance,
    clearEnhanceConfirm,
  } = useIngredientActions({
    initialGeneratingCaptions: isGeneratingCaptions,
    initialPortraiting: isPortraiting,
    onDeleteIngredient,
    onPublishIngredient,
    onRefresh,
  });

  const handleDownload = useMemo(() => createDownloadHandler(), []);

  // Video playback control
  useEffect(() => {
    if (!isHoveringRef.current) {
      stopAndResetVideo(videoRef);
    }
    return () => {
      if (playTimeoutRef.current) {
        clearTimeout(playTimeoutRef.current);
      }
      stopAndResetVideo(videoRef);
    };
  }, []);

  // Stop video when leaving container
  useEffect(() => {
    if (isContainerHovered) {
      return;
    }

    stopAndResetVideo(videoRef);
    if (playTimeoutRef.current) {
      clearTimeout(playTimeoutRef.current);
      playTimeoutRef.current = null;
    }
    isHoveringRef.current = false;

    const frameId = requestAnimationFrame(() => {
      setShowActions(false);
      onHoverChange?.(false);
      setIsHovered(false);
    });

    return () => cancelAnimationFrame(frameId);
  }, [isContainerHovered, onHoverChange]);

  // Video hover handler with playback control
  const handleMouseHover = useCallback(
    (isHover: boolean = true, event?: MouseEvent) => {
      if (!videoRef.current) {
        return;
      }

      if (playTimeoutRef.current) {
        clearTimeout(playTimeoutRef.current);
        playTimeoutRef.current = null;
      }

      // Check if moving to dropdown/quick-actions
      if (!isHover && event) {
        const relatedTarget = event.relatedTarget;
        const currentTarget = event.currentTarget as HTMLElement;

        if (!relatedTarget) {
          // Mouse leaving to outside
          setShowActions(false);
          setIsHovered(false);
          onHoverChange?.(false);
          return stopAndResetVideo(videoRef);
        }

        if (relatedTarget instanceof Element) {
          const isInsideDropdown =
            relatedTarget.closest('[data-dropdown]') ||
            relatedTarget.closest('[data-quick-actions-dropdown]') ||
            relatedTarget.closest('[role="menu"]') ||
            relatedTarget.closest('[role="listbox"]');

          if (isInsideDropdown) {
            return;
          }

          const quickActionsWrapper = relatedTarget.closest(
            '.quick-actions-wrapper',
          ) as HTMLElement | null;

          if (
            quickActionsWrapper &&
            currentTarget.contains(quickActionsWrapper)
          ) {
            return;
          }
        }
      }

      isHoveringRef.current = isHover;
      setShowActions(isHover);
      setIsHovered(isHover);
      onHoverChange?.(isHover);

      if (isHover) {
        playTimeoutRef.current = setTimeout(() => {
          if (videoRef.current && isHoveringRef.current) {
            videoRef.current.muted = true;
            videoRef.current.currentTime = 0;
            const playPromise = videoRef.current.play();
            if (playPromise !== undefined) {
              playPromise.catch((error) => {
                logger.debug('Video autoplay prevented by browser:', error);
              });
            }
          }
        }, 50);
      } else {
        stopAndResetVideo(videoRef);
      }
    },
    [onHoverChange],
  );

  const handleQuickActionsMouseEnter = useCallback(() => {
    handleMouseHover(true);
  }, [handleMouseHover]);

  const handleQuickActionsMouseLeave = useCallback(
    (e: MouseEvent) => {
      const relatedTarget = e.relatedTarget;

      if (relatedTarget && relatedTarget instanceof Element) {
        const isInsideDropdown =
          relatedTarget.closest('[data-dropdown]') ||
          relatedTarget.closest('[data-quick-actions-dropdown]') ||
          relatedTarget.closest('[role="menu"]') ||
          relatedTarget.closest('[role="listbox"]');

        if (isInsideDropdown) {
          return;
        }

        const masonryItem = relatedTarget.closest('[data-masonry-item]');
        if (
          masonryItem &&
          masonryItem === e.currentTarget.closest('[data-masonry-item]')
        ) {
          return;
        }
      }

      handleMouseHover(false, e);
    },
    [handleMouseHover],
  );

  const handleIngredientDrop = (
    droppedIngredient: Pick<IIngredient, 'id' | 'folder'>,
    targetIngredient: IVideo,
  ) => {
    if (onUpdateParent && droppedIngredient.id !== targetIngredient.id) {
      onUpdateParent(droppedIngredient as IVideo, targetIngredient.id);
    }
  };

  const handleMediaDragStart = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!isDragEnabled || !onUpdateParent) {
        return;
      }

      event.dataTransfer.effectAllowed = 'move';
      writeIngredientTransferData(event.dataTransfer, video as IIngredient);
    },
    [isDragEnabled, onUpdateParent, video],
  );

  const content = (
    <div
      onMouseEnter={() => !isInteractionBlocked && handleMouseHover(true)}
      onMouseLeave={(e) => !isInteractionBlocked && handleMouseHover(false, e)}
      data-masonry-item="true"
      data-state={isHovered ? 'hovered' : 'idle'}
      className={cn(
        'relative block w-full cursor-pointer rounded-lg border border-white/[0.08] bg-card transition-[border-color,background-color] duration-200 hover:border-white/[0.14]',
        isScrollFocused && SCROLL_FOCUS_SURFACE_CLASS,
        video.aspectRatio,
        isSelected && 'border-primary',
        isDarkroomLocked && 'cursor-not-allowed',
        isFormatCompatible ? '' : 'opacity-50',
      )}
    >
      {/* Inner wrapper with overflow-hidden for media clipping */}
      <div className={cn('overflow-hidden', MASONRY_TILE_RADIUS_CLASS)}>
        {/* Badges - hide when processing */}
        {!isUnavailable && !isPublicGallery && (
          <MasonryBadgeOverlay
            ingredient={video}
            evaluationScore={evaluationScore}
            isPublicGallery={isPublicGallery}
          />
        )}

        {/* Brand logo for public galleries */}
        <MasonryBrandLogo
          ingredient={video}
          isPublicGallery={isPublicGallery}
          isPublicProfile={isPublicProfile}
        />

        {/* Media content */}
        {isUnavailable ? (
          <div
            data-testid={`masonry-ingredient-${video.id}`}
            className="cursor-pointer relative w-full"
            draggable={isDragEnabled && !!onUpdateParent}
            onDragStartCapture={handleMediaDragStart}
            style={{
              aspectRatio:
                metadata?.width && metadata?.height
                  ? `${metadata.width} / ${metadata.height}`
                  : '9 / 16',
            }}
            onClick={() => {
              if (!isDarkroomLocked) {
                onClickIngredient?.(video);
              }
            }}
          >
            {isProcessing && (
              <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none bg-black/20 backdrop-blur-sm">
                <div
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
          <div
            data-testid={`masonry-ingredient-${video.id}`}
            className="cursor-pointer relative w-full"
            draggable={isDragEnabled && !!onUpdateParent}
            onDragStartCapture={handleMediaDragStart}
            style={{
              aspectRatio:
                metadata?.width && metadata?.height
                  ? `${metadata.width} / ${metadata.height}`
                  : '9 / 16',
            }}
            onClick={() => {
              if (!isDarkroomLocked) {
                onClickIngredient?.(video);
              }
            }}
          >
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
      </div>

      {/* Quick actions bar */}
      {isActionsEnabled && (
        <div
          className={cn(
            'absolute inset-x-0 bottom-0 z-50 w-full overflow-visible border-t border-white/[0.08] bg-black/72 p-2 backdrop-blur-sm transition-opacity duration-200',
            showActions ? 'opacity-100' : 'opacity-0 pointer-events-none',
            'group-hover:opacity-100',
          )}
        >
          <div className="flex items-end justify-end gap-2">
            <div className="flex-shrink-0 flex items-center gap-2">
              {onVoteIngredient ? (
                <Button
                  label={
                    <>
                      <HiHandThumbUp /> {video.totalVotes || 0}
                    </>
                  }
                  variant={ButtonVariant.DEFAULT}
                  size={ButtonSize.SM}
                  className={`${
                    video.hasVoted
                      ? 'bg-green-500 hover:bg-green-600 text-white cursor-default'
                      : ''
                  } ${video.isVoteAnimating ? 'animate-vote' : ''}`}
                  onClick={() => onVoteIngredient?.(video)}
                />
              ) : (
                !isUnavailable &&
                showActions && (
                  <div
                    className="quick-actions-wrapper flex items-center gap-2"
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onMouseEnter={handleQuickActionsMouseEnter}
                    onMouseLeave={handleQuickActionsMouseLeave}
                  >
                    <IngredientQuickActions
                      {...actionStates}
                      isMasonryCompact
                      selectedIngredient={video}
                      availableTags={availableTags}
                      isLoadingTags={isLoadingTags}
                      isPortraiting={isPortraiting}
                      isGeneratingCaptions={isGeneratingCaptions}
                      isMirroring={isMirroring}
                      isReversing={isReversing}
                      isSelected={isSelected}
                      onPublish={handlers.handlePublish}
                      onShare={onShareIngredient}
                      onUpscale={handlers.handleUpscale}
                      onClone={handlers.handleClone}
                      onDelete={handlers.handleDelete}
                      onConvertToGif={handlers.handleConvertToGif}
                      onPortrait={handlers.handlePortrait}
                      onSquare={handlers.handleSquare}
                      onLandscape={handlers.handleLandscape}
                      onReverse={onReverse || handlers.handleReverse}
                      onMirror={onMirror || handlers.handleMirror}
                      onSeeDetails={onSeeDetails}
                      onMarkArchived={handlers.handleMarkArchived}
                      onMarkValidated={onMarkValidated}
                      onMarkRejected={onMarkRejected}
                      onToggleFavorite={onToggleFavorite}
                      onCopy={onCopyPrompt}
                      onReprompt={onReprompt}
                      onDownload={handleDownload}
                      onScopeChange={onScopeChange}
                      onRefresh={onRefresh}
                    />
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // Wrap with drag/drop if enabled
  if (isDragEnabled && onUpdateParent) {
    return (
      <DropZoneIngredient
        ingredient={video as IIngredient}
        onDrop={handleIngredientDrop}
        isEnabled={!video.parent}
      >
        <DraggableIngredient ingredient={video as IIngredient}>
          {content}
        </DraggableIngredient>
      </DropZoneIngredient>
    );
  }

  return (
    <>
      {content}
      {isActionsEnabled && (
        <MasonryConfirmBridge
          upscaleConfirmData={upscaleConfirmData}
          executeUpscale={executeUpscale}
          clearUpscaleConfirm={clearUpscaleConfirm}
          enhanceConfirmData={enhanceConfirmData}
          executeEnhance={executeEnhance}
          clearEnhanceConfirm={clearEnhanceConfirm}
        />
      )}
    </>
  );
}
