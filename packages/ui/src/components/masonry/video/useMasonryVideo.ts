import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { ContentRating, IngredientStatus } from '@genfeedai/contracts';
import type {
  IIngredient,
  IMetadata,
  IVideo,
} from '@genfeedai/contracts/interfaces';
import { useAuthorizedMediaPreview } from '@genfeedai/hooks/media/use-authorized-media-preview';
import { stopAndResetVideo } from '@genfeedai/hooks/media/video-utils/video.utils';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { resolveIngredientReferenceUrl } from '@genfeedai/utils/media/reference.util';
import { writeIngredientTransferData } from '@ui/drag-drop/shared/ingredient-transfer';
import { useIngredientDownloadHandler } from '@ui/masonry/shared/useMasonryHover';
import type { DragEvent, MouseEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface UseMasonryVideoParams {
  video: IVideo;
  isContainerHovered: boolean;
  isDragEnabled: boolean;
  onUpdateParent?: ((ingredient: IVideo, parentId: string) => void) | undefined;
  onHoverChange?: ((isHovered: boolean) => void) | undefined;
  previewRetryRevision?: number;
}

export function useMasonryVideo({
  video,
  isContainerHovered,
  isDragEnabled,
  onUpdateParent,
  onHoverChange,
  previewRetryRevision = 0,
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

  const mediaPreview = useAuthorizedMediaPreview(video, previewRetryRevision);
  const ingredientUrl = mediaPreview
    ? (mediaPreview.url ?? '')
    : (video?.ingredientUrl ?? '');
  const explicitThumbnail = mediaPreview
    ? null
    : 'thumbnailUrl' in video
      ? video.thumbnailUrl
      : null;
  const isProcessing = video.status === IngredientStatus.PROCESSING;
  const isFailed = video.status === IngredientStatus.FAILED;
  const isUnavailable = isProcessing || isFailed;
  // The file is gone but the row stays: the tile keeps its poster and actions.
  const isExpired = Boolean(video.storageExpiredAt);
  const isFleetNsfwSensitive =
    selectedBrand?.isFleetEnabled &&
    !!video.personaSlug &&
    video.contentRating !== ContentRating.SFW;
  const isFleetNsfwLocked =
    Boolean(isFleetNsfwSensitive) && !settings?.isFleetNsfwVisible;
  const isInteractionBlocked = isUnavailable || isFleetNsfwLocked;

  // A real poster is the video's own thumbnail or its first reference image.
  // The generic placeholder is another asset's picture to anyone looking at
  // the tile, so it is never painted as a poster: a tile with no poster shows
  // a neutral block until the video itself has a frame to show. The Video
  // model's thumbnailUrl getter always returns that placeholder, so it does
  // not count.
  const isPlaceholderThumbnail = Boolean(
    explicitThumbnail?.startsWith(
      `${EnvironmentService.assetsEndpoint}/placeholders/`,
    ),
  );
  const posterImageUrl =
    (explicitThumbnail && !isPlaceholderThumbnail ? explicitThumbnail : null) ||
    referenceImageUrl ||
    null;
  const hasPosterThumbnail = posterImageUrl !== null;

  const metadata =
    typeof video.metadata === 'object' && video.metadata
      ? (video.metadata as IMetadata)
      : null;
  const metadataLabel = metadata?.label;

  const handleDownload = useIngredientDownloadHandler();

  // Video playback control
  // use-effect-audit: ignore controls a video element and its play timer
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
  // use-effect-audit: ignore frame loop outside React
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
    isFailed,
    isUnavailable,
    isExpired,
    isFleetNsfwLocked,
    isInteractionBlocked,
    hasPosterThumbnail,
    posterImageUrl,
    ingredientUrl,
    metadata,
    metadataLabel,
    handleDownload,
    handleMouseHover,
    handleQuickActionsMouseEnter,
    handleQuickActionsMouseLeave,
    handleIngredientDrop,
    handleMediaDragStart,
  };
}
