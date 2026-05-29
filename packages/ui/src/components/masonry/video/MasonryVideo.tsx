'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { IngredientStatus } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { stopAndResetVideo } from '@genfeedai/hooks/media/video-utils/video.utils';
import useIngredientActions from '@genfeedai/hooks/ui/ingredient/use-ingredient-actions/use-ingredient-actions';
import type { IIngredient, IMetadata, IVideo } from '@genfeedai/interfaces';
import type { MasonryVideoProps } from '@genfeedai/props/content/masonry.props';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { resolveIngredientReferenceUrl } from '@genfeedai/utils/media/reference.util';
import DraggableIngredient from '@ui/drag-drop/draggable/DraggableIngredient';
import { writeIngredientTransferData } from '@ui/drag-drop/shared/ingredient-transfer';
import DropZoneIngredient from '@ui/drag-drop/zone-ingredient/DropZoneIngredient';
import MasonryBadgeOverlay from '@ui/masonry/shared/MasonryBadgeOverlay';
import MasonryBrandLogo from '@ui/masonry/shared/MasonryBrandLogo';
import MasonryConfirmBridge from '@ui/masonry/shared/MasonryConfirmBridge';
import { createDownloadHandler } from '@ui/masonry/shared/useMasonryHover';
import { SCROLL_FOCUS_SURFACE_CLASS } from '@ui/styles/scroll-focus';
import type { DragEvent, MouseEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MasonryVideoActionsBar from './MasonryVideoActionsBar';
import MasonryVideoMediaArea from './MasonryVideoMediaArea';

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
      setIsHovered(false);
      onHoverChange?.(false);
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
        'relative block w-full cursor-pointer rounded-xl border border-white/[0.08] bg-card transition-[border-color,background-color] duration-200 hover:border-white/[0.14]',
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
        <MasonryVideoMediaArea
          video={video}
          metadata={metadata}
          isUnavailable={isUnavailable}
          isProcessing={isProcessing}
          isDarkroomLocked={isDarkroomLocked}
          isDragEnabled={isDragEnabled}
          hasUpdateParent={!!onUpdateParent}
          placeholderImageUrl={placeholderImageUrl}
          thumbnailImageUrl={thumbnailImageUrl}
          ingredientUrl={ingredientUrl}
          metadataLabel={metadataLabel}
          videoRef={videoRef}
          handleMediaDragStart={handleMediaDragStart}
          onClickIngredient={onClickIngredient}
          onRefresh={onRefresh}
          onImageLoad={onImageLoad}
        />
      </div>

      {/* Quick actions bar */}
      <MasonryVideoActionsBar
        video={video}
        isHovered={isHovered}
        isActionsEnabled={isActionsEnabled}
        isUnavailable={isUnavailable}
        isSelected={isSelected}
        isPortraiting={isPortraiting}
        isGeneratingCaptions={isGeneratingCaptions}
        isMirroring={isMirroring}
        isReversing={isReversing}
        actionStates={actionStates}
        handlers={handlers}
        availableTags={availableTags}
        isLoadingTags={isLoadingTags}
        handleDownload={handleDownload}
        handleQuickActionsMouseEnter={handleQuickActionsMouseEnter}
        handleQuickActionsMouseLeave={handleQuickActionsMouseLeave}
        onVoteIngredient={onVoteIngredient}
        onShareIngredient={onShareIngredient}
        onSeeDetails={onSeeDetails}
        onMarkValidated={onMarkValidated}
        onMarkRejected={onMarkRejected}
        onToggleFavorite={onToggleFavorite}
        onCopyPrompt={onCopyPrompt}
        onReprompt={onReprompt}
        onScopeChange={onScopeChange}
        onRefresh={onRefresh}
        onReverse={onReverse}
        onMirror={onMirror}
      />
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
