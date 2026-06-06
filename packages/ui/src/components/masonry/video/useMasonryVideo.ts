import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { IngredientStatus } from '@genfeedai/enums';
import { stopAndResetVideo } from '@genfeedai/hooks/media/video-utils/video.utils';
import useIngredientActions from '@genfeedai/hooks/ui/ingredient/use-ingredient-actions/use-ingredient-actions';
import type { IIngredient, IMetadata, IVideo } from '@genfeedai/interfaces';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { resolveIngredientReferenceUrl } from '@genfeedai/utils/media/reference.util';
import { writeIngredientTransferData } from '@ui/drag-drop/shared/ingredient-transfer';
import { createDownloadHandler } from '@ui/masonry/shared/useMasonryHover';
import type { DragEvent, MouseEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface UseMasonryVideoParams {
  video: IVideo;
  isGeneratingCaptions: boolean;
  isPortraiting: boolean;
  isContainerHovered: boolean;
  isDragEnabled: boolean;
  onDeleteIngredient?: ((ingredient: IVideo) => void) | undefined;
  onPublishIngredient?: ((ingredient: IVideo) => void) | undefined;
  onRefresh?: (() => void) | undefined;
  onUpdateParent?: ((ingredient: IVideo, parentId: string) => void) | undefined;
  onHoverChange?: ((isHovered: boolean) => void) | undefined;
}

export function useMasonryVideo({
  video,
  isGeneratingCaptions,
  isPortraiting,
  isContainerHovered,
  isDragEnabled,
  onDeleteIngredient,
  onPublishIngredient,
  onRefresh,
  onUpdateParent,
  onHoverChange,
}: UseMasonryVideoParams) {
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

  return {
    videoRef,
    isHovered,
    isProcessing,
    isUnavailable,
    isDarkroomLocked,
    isInteractionBlocked,
    placeholderImageUrl,
    thumbnailImageUrl,
    ingredientUrl,
    metadata,
    metadataLabel,
    actionStates,
    handlers,
    upscaleConfirmData,
    executeUpscale,
    clearUpscaleConfirm,
    enhanceConfirmData,
    executeEnhance,
    clearEnhanceConfirm,
    handleDownload,
    handleMouseHover,
    handleQuickActionsMouseEnter,
    handleQuickActionsMouseLeave,
    handleIngredientDrop,
    handleMediaDragStart,
  };
}
