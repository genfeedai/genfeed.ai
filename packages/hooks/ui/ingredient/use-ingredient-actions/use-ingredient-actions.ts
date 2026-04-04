import type { IIngredient, IMetadata } from '@genfeedai/interfaces';
import type { MasonryActionStates } from '@genfeedai/interfaces/hooks/hooks.interface';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  AssetCategory,
  IngredientCategory,
  IngredientFormat,
  IngredientStatus,
  ModalEnum,
} from '@genfeedai/enums';
import { downloadIngredient } from '@helpers/media/download/download.helper';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useIngredientServices } from '@hooks/data/ingredients/use-ingredient-services/use-ingredient-services';
import { useEnhanceUpscale } from '@hooks/ui/ingredient/use-enhance-upscale/use-enhance-upscale';
import {
  executeSilentWithActionState,
  executeWithActionState,
  withServiceOperation,
} from '@hooks/utils/service-operation/service-operation.util';
import { useSocketManager } from '@hooks/utils/use-socket-manager/use-socket-manager';
import { AssetsService } from '@services/content/assets.service';
import { ClipboardService } from '@services/core/clipboard.service';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import type { VideosService } from '@services/ingredients/videos.service';
import {
  isImageIngredient,
  isVideoIngredient,
} from '@utils/media/ingredient-type.util';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Options for the useIngredientActions hook
 */
export interface UseIngredientActionsOptions {
  onDeleteIngredient?: (ingredient: IIngredient) => void | Promise<void>;
  onPublishIngredient?: (ingredient: IIngredient) => void;
  onRefresh?: () => void | Promise<void>;
  initialPortraiting?: boolean;
  initialGeneratingCaptions?: boolean;
  onConvertToVideo?: (ingredient: IIngredient) => void;
  onUseAsVideoReference?: (ingredient: IIngredient) => void;
  onSeeDetails?: (ingredient: IIngredient) => void | Promise<void>;
  onUpdateSharing?: (
    ingredient: IIngredient,
    field: string,
    value: boolean | string,
  ) => void | Promise<void>;
  onUpdateMetadata?: (
    ingredient: IIngredient,
    field: string,
    value: string,
  ) => void | Promise<void>;
  onUpdateParent?: (
    ingredient: IIngredient,
    parentId: string | null,
  ) => void | Promise<void>;
  onShare?: (ingredient: IIngredient) => void | Promise<void>;
  onCopyPrompt?: (ingredient: IIngredient) => void | Promise<void>;
  onReprompt?: (ingredient: IIngredient) => void | Promise<void>;
}

export function useIngredientActions({
  onDeleteIngredient,
  onPublishIngredient,
  onRefresh,
  initialPortraiting = false,
  initialGeneratingCaptions = false,
  onConvertToVideo,
  onUseAsVideoReference,
  onSeeDetails,
  onUpdateSharing,
  onUpdateMetadata,
  onUpdateParent,
  onShare,
  onCopyPrompt,
  onReprompt,
}: UseIngredientActionsOptions = {}) {
  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );
  const clipboardService = useMemo(() => ClipboardService.getInstance(), []);
  const { brandId } = useBrand();
  const { subscribe } = useSocketManager();

  // Track pending asset uploads for websocket updates
  const [pendingAssetId, setPendingAssetId] = useState<string | null>(null);
  const [pendingAssetCategory, setPendingAssetCategory] =
    useState<AssetCategory | null>(null);

  const { getIngredientsService, getVideosService, getImagesService } =
    useIngredientServices();

  const getAssetsService = useAuthedService((token: string) =>
    AssetsService.getInstance(token),
  );

  // Global confirm modal access is handled in parent contexts

  // UI state
  const [showActions, setShowActions] = useState(false);

  // Loading states with proper TypeScript typing
  const [actionStates, setActionStates] = useState<MasonryActionStates>({
    isAddingTextOverlay: false,
    isCloning: false,
    isConverting: false,
    isConvertingToVideo: false,
    isDeleting: false,
    isDownloading: false,
    isEnhancing: false,
    isGeneratingCaptions: initialGeneratingCaptions,
    isLandscaping: false,
    isMarkingArchived: false,
    isMarkingRejected: false,
    isMarkingValidated: false,
    isMirroring: false,
    isPortraiting: initialPortraiting,
    isPublishing: false,
    isReversing: false,
    isSettingAsBanner: false,
    isSettingAsLogo: false,
    isSquaring: false,
    isUpscaling: false,
    isVoting: false,
  });

  // Extracted enhance/upscale concern into dedicated hook
  const {
    handleUpscale,
    handleEnhance,
    upscaleConfirmData,
    upscaleConfirmMessage,
    enhanceConfirmData,
    enhanceConfirmMessage,
    executeUpscale,
    executeEnhance,
    clearUpscaleConfirm,
    clearEnhanceConfirm,
  } = useEnhanceUpscale({
    getImagesService,
    getVideosService,
    onRefresh,
    setActionStates,
  });

  // AbortControllers for request cancellation
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllersRef.current.forEach((controller) => controller.abort());
    };
  }, []);

  // Parent components can watch enhanceConfirmData/upscaleConfirmData
  // and call openConfirm from useConfirmModal hook to display the modal.

  // Listen for asset status updates via websocket (for set as logo/banner)
  useEffect(() => {
    if (!pendingAssetId || !pendingAssetCategory) {
      return;
    }

    const unsubscribe = subscribe('asset-status', (data: any) => {
      const { assetId, status, metadata } = data;

      logger.info(
        'Asset status websocket event received in use-ingredient-actions',
        {
          assetId,
          metadata,
          pendingAssetId,
          status,
        },
      );

      // Only process if this is our pending asset
      if (String(assetId) !== String(pendingAssetId)) {
        return;
      }

      if (status === 'completed') {
        setActionStates((prev) => ({
          ...prev,
          isSettingAsBanner: false,
          isSettingAsLogo: false,
        }));

        if (onRefresh) {
          onRefresh();
        }

        setPendingAssetId(null);
        setPendingAssetCategory(null);
      } else if (status === 'failed') {
        setActionStates((prev) => ({
          ...prev,
          isSettingAsBanner: false,
          isSettingAsLogo: false,
        }));

        notificationsService.error(
          `Failed to set as ${pendingAssetCategory === AssetCategory.BANNER ? 'banner' : 'logo'}`,
        );

        setPendingAssetId(null);
        setPendingAssetCategory(null);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [
    pendingAssetId,
    pendingAssetCategory,
    subscribe,
    notificationsService,
    onRefresh,
  ]);

  /**
   * Publish an ingredient to a platform
   */
  const handlePublish = useCallback(
    async (ingredient: IIngredient) => {
      if (onPublishIngredient) {
        onPublishIngredient(ingredient);
      }
    },
    [onPublishIngredient],
  );

  /**
   * Mark an ingredient as archived
   */
  const handleMarkArchived = useCallback(
    async (ingredient: IIngredient) => {
      if (ingredient.status === IngredientStatus.ARCHIVED) {
        return;
      }

      await executeSilentWithActionState<any, MasonryActionStates>({
        errorMessage: 'Failed to archive ingredient',
        onSuccess: onRefresh,
        operation: async () => {
          const service = await getIngredientsService();
          return service.patch(ingredient.id, {
            status: IngredientStatus.ARCHIVED,
          });
        },
        setActionStates,
        stateKey: 'isMarkingArchived',
        url: `PATCH /ingredients/${ingredient.id} [status: archived]`,
      });
    },
    [onRefresh, getIngredientsService],
  );

  /**
   * Mark an ingredient as validated (usable)
   */
  const handleMarkValidated = useCallback(
    async (ingredient: IIngredient) => {
      if (ingredient.status === IngredientStatus.VALIDATED) {
        return;
      }

      await executeSilentWithActionState<any, MasonryActionStates>({
        errorMessage: 'Failed to mark as validated',
        onSuccess: onRefresh,
        operation: async () => {
          const service = await getIngredientsService();
          return service.patch(ingredient.id, {
            status: IngredientStatus.VALIDATED,
          });
        },
        setActionStates,
        stateKey: 'isMarkingValidated',
        url: `PATCH /ingredients/${ingredient.id} [status: validated]`,
      });
    },
    [onRefresh, getIngredientsService],
  );

  /**
   * Mark an ingredient as rejected
   */
  const handleMarkRejected = useCallback(
    async (ingredient: IIngredient) => {
      if (ingredient.status === IngredientStatus.REJECTED) {
        return;
      }

      await executeSilentWithActionState<any, MasonryActionStates>({
        errorMessage: 'Failed to reject ingredient',
        onSuccess: onRefresh,
        operation: async () => {
          const service = await getIngredientsService();
          return service.patch(ingredient.id, {
            status: IngredientStatus.REJECTED,
          });
        },
        setActionStates,
        stateKey: 'isMarkingRejected',
        url: `PATCH /ingredients/${ingredient.id} [status: rejected]`,
      });
    },
    [onRefresh, getIngredientsService],
  );

  /**
   * Upscale an ingredient (video or image)
   * Sets confirmation data instead of directly calling API
   */
  // Note: upscale handlers moved to useEnhanceUpscale

  /**
   * Clone an ingredient
   */
  const handleClone = useCallback(
    async (ingredient: IIngredient) => {
      await executeSilentWithActionState<any, MasonryActionStates>({
        errorMessage: 'Failed to clone ingredient',
        onSuccess: onRefresh,
        operation: async () => {
          const service = await getIngredientsService();
          return service.postClone(ingredient.id);
        },
        setActionStates,
        stateKey: 'isCloning',
        url: `POST /ingredients/${ingredient.id}/clone`,
      });
    },
    [onRefresh, getIngredientsService],
  );

  /**
   * Reverse a video ingredient
   */
  const handleReverse = useCallback(
    async (ingredient: IIngredient) => {
      if (!isVideoIngredient(ingredient)) {
        return notificationsService.error('Can only reverse videos');
      }

      await executeSilentWithActionState<any, MasonryActionStates>({
        errorMessage: 'Failed to reverse video',
        onSuccess: onRefresh,
        operation: async () => {
          const service = (await getVideosService()) as VideosService;
          return service.postReverse(ingredient.id);
        },
        setActionStates,
        stateKey: 'isReversing',
        url: `POST /videos/${ingredient.id}/reverse`,
      });
    },
    [onRefresh, getVideosService, notificationsService],
  );

  /**
   * Delete an ingredient
   */
  const handleDelete = useCallback(
    async (ingredient: IIngredient) => {
      const url = `DELETE /ingredients/${ingredient.id}`;
      if (onDeleteIngredient) {
        setActionStates((prev) => ({ ...prev, isDeleting: true }));

        try {
          await onDeleteIngredient(ingredient);
          setActionStates((prev) => ({ ...prev, isDeleting: false }));
        } catch (error: any) {
          notificationsService.error('Failed to delete ingredient');
          logger.error(`${url} failed`, error);
          setActionStates((prev) => ({ ...prev, isDeleting: false }));
        }
      } else {
        setActionStates((prev) => ({ ...prev, isDeleting: true }));
        const url = `DELETE /ingredients/${ingredient.id}`;

        try {
          const service = await getIngredientsService();
          await service.delete(ingredient.id);

          logger.info(`${url} success`);

          if (onRefresh) {
            await onRefresh();
          }

          notificationsService.success('Ingredient deleted successfully');
          setActionStates((prev) => ({ ...prev, isDeleting: false }));
        } catch (error: any) {
          logger.error(`${url} failed`, error);
          notificationsService.error('Failed to delete ingredient');
          setActionStates((prev) => ({ ...prev, isDeleting: false }));
        }
      }
    },
    [
      onDeleteIngredient,
      getIngredientsService,
      notificationsService,
      onRefresh,
    ],
  );

  /**
   * Download an ingredient
   */
  const handleDownload = useCallback(
    async (ingredient: IIngredient) => {
      if (!ingredient.ingredientUrl) {
        return notificationsService.error('No download URL available');
      }

      setActionStates((prev) => ({ ...prev, isDownloading: true }));

      try {
        await downloadIngredient(ingredient);
        notificationsService.success('Download started');
      } catch (error) {
        logger.error('Failed to download ingredient', error);
        notificationsService.error('Download failed');
      } finally {
        setActionStates((prev) => ({ ...prev, isDownloading: false }));
      }
    },
    [notificationsService],
  );

  /**
   * Mirror a video ingredient
   */
  const handleMirror = useCallback(
    async (ingredient: IIngredient) => {
      if (!isVideoIngredient(ingredient)) {
        return notificationsService.error('Can only mirror videos');
      }

      await executeSilentWithActionState<any, MasonryActionStates>({
        errorMessage: 'Failed to mirror video',
        onSuccess: onRefresh,
        operation: async () => {
          const service = (await getVideosService()) as VideosService;
          return service.postMirror(ingredient.id);
        },
        setActionStates,
        stateKey: 'isMirroring',
        url: `POST /videos/${ingredient.id}/mirror`,
      });
    },
    [onRefresh, getVideosService, notificationsService],
  );

  /**
   * Convert a video to portrait orientation
   */
  const handlePortrait = useCallback(
    async (ingredient: IIngredient) => {
      await executeSilentWithActionState<any, MasonryActionStates>({
        errorMessage: 'Portrait conversion failed',
        onSuccess: onRefresh,
        operation: async () => {
          const service =
            ingredient.category === IngredientCategory.VIDEO
              ? ((await getVideosService()) as VideosService)
              : await getImagesService();
          return service.postReframe(ingredient.id, {
            format: IngredientFormat.PORTRAIT,
          });
        },
        setActionStates,
        stateKey: 'isPortraiting',
        url: `POST /${ingredient.category}s/${ingredient.id}/reframe [portrait]`,
      });
    },
    [onRefresh, getVideosService, getImagesService],
  );

  /**
   * Convert an ingredient to square format
   */
  const handleSquare = useCallback(
    async (ingredient: IIngredient) => {
      await executeSilentWithActionState<any, MasonryActionStates>({
        errorMessage: 'Square conversion failed',
        onSuccess: onRefresh,
        operation: async () => {
          const service =
            ingredient.category === IngredientCategory.VIDEO
              ? ((await getVideosService()) as VideosService)
              : await getImagesService();
          return service.postReframe(ingredient.id, {
            format: IngredientFormat.SQUARE,
          });
        },
        setActionStates,
        stateKey: 'isSquaring',
        url: `POST /${ingredient.category}s/${ingredient.id}/reframe [square]`,
      });
    },
    [onRefresh, getVideosService, getImagesService],
  );

  /**
   * Convert an ingredient to landscape format
   */
  const handleLandscape = useCallback(
    async (ingredient: IIngredient) => {
      await executeSilentWithActionState<any, MasonryActionStates>({
        errorMessage: 'Landscape conversion failed',
        onSuccess: onRefresh,
        operation: async () => {
          const service =
            ingredient.category === IngredientCategory.VIDEO
              ? ((await getVideosService()) as VideosService)
              : await getImagesService();
          return service.postReframe(ingredient.id, {
            format: IngredientFormat.LANDSCAPE,
          });
        },
        setActionStates,
        stateKey: 'isLandscaping',
        url: `POST /${ingredient.category}s/${ingredient.id}/reframe [landscape]`,
      });
    },
    [onRefresh, getVideosService, getImagesService],
  );

  /**
   * Convert a video to GIF
   */
  const handleConvertToGif = useCallback(
    async (ingredient: IIngredient) => {
      if (!isVideoIngredient(ingredient)) {
        return notificationsService.error('Can only convert videos to GIF');
      }

      await executeSilentWithActionState<any, MasonryActionStates>({
        errorMessage: 'Failed to convert to GIF',
        onSuccess: onRefresh,
        operation: async () => {
          const service = (await getVideosService()) as VideosService;
          return service.postGif(ingredient.id);
        },
        setActionStates,
        stateKey: 'isConverting',
        url: `POST /videos/${ingredient.id}/gif`,
      });
    },
    [onRefresh, getVideosService, notificationsService],
  );

  /**
   * Convert an image to video (opens ModalImageToVideo)
   * Used in manager app for actual conversion
   *
   * NOTE: This hook cannot directly use Next.js router because hooks don't have access to it.
   * The parent component should pass onConvertToVideo callback that opens ModalImageToVideo
   */
  const handleConvertToVideo = useCallback(
    async (ingredient: IIngredient) => {
      if (onConvertToVideo) {
        return onConvertToVideo(ingredient);
      }

      if (!isImageIngredient(ingredient)) {
        return notificationsService.error('Can only convert images to video');
      }

      // If no callback provided, this functionality won't work properly
      // The parent component must provide onConvertToVideo that opens ModalImageToVideo
      notificationsService.error(
        'Conversion not configured. Please contact support.',
      );
    },
    [onConvertToVideo, notificationsService],
  );

  /**
   * Use image as video reference (navigates to studio)
   * Used in studio app to navigate to video studio with image as reference
   *
   * NOTE: This hook cannot directly use Next.js router because hooks don't have access to it.
   * The parent component should pass onUseAsVideoReference callback that uses router.push()
   */
  const handleUseAsVideoReference = useCallback(
    async (ingredient: IIngredient) => {
      if (onUseAsVideoReference) {
        return onUseAsVideoReference(ingredient);
      }

      if (!isImageIngredient(ingredient)) {
        return notificationsService.error(
          'Can only use images as video reference',
        );
      }

      // If no callback provided, this functionality won't work properly
      // The parent component must provide onUseAsVideoReference that uses router.push()
      notificationsService.error(
        'Navigation not configured. Please contact support.',
      );
    },
    [onUseAsVideoReference, notificationsService],
  );

  /**
   * Vote or unvote on an ingredient
   */
  const handleVote = useCallback(
    async (ingredient: IIngredient) => {
      const endpoint = ingredient.hasVoted ? 'unvote' : 'vote';
      const willHaveVoted = !ingredient.hasVoted;

      await executeWithActionState<any, MasonryActionStates>({
        errorMessage: 'Failed to vote',
        operation: async () => {
          const service = await getIngredientsService();
          await service.vote(ingredient.id, endpoint);
          // Optimistically update the vote state
          ingredient.hasVoted = willHaveVoted;
          ingredient.totalVotes =
            (ingredient.totalVotes || 0) + (willHaveVoted ? 1 : -1);
        },
        setActionStates,
        stateKey: 'isVoting',
        successMessage: willHaveVoted ? 'Voted successfully' : 'Vote removed',
        url: `POST /ingredients/${ingredient.id}/${endpoint}`,
      });
    },
    [getIngredientsService],
  );

  /**
   * Generate captions for a video
   */
  const handleGenerateCaptions = useCallback(
    async (ingredient: IIngredient) => {
      if (!isVideoIngredient(ingredient)) {
        return notificationsService.error(
          'Can only generate captions for videos',
        );
      }

      await executeSilentWithActionState<any, MasonryActionStates>({
        errorMessage: 'Failed to generate captions',
        onSuccess: onRefresh,
        operation: async () => {
          const service = (await getVideosService()) as VideosService;
          return service.postCaptions(ingredient.id, 'captions');
        },
        setActionStates,
        stateKey: 'isGeneratingCaptions',
        url: `POST /videos/${ingredient.id}/captions`,
      });
    },
    [onRefresh, getVideosService, notificationsService],
  );

  /**
   * Add text overlay to an ingredient
   */
  const handleAddTextOverlay = useCallback(
    async (ingredient: IIngredient) => {
      if (!isVideoIngredient(ingredient)) {
        return notificationsService.error(
          'Can only add text overlay to videos',
        );
      }

      openModal(ModalEnum.TEXT_OVERLAY);
    },
    [notificationsService],
  );

  /**
   * Enhance an ingredient using Topaz upscale
   */
  // Note: enhance handlers moved to useEnhanceUpscale

  /**
   * Set an image as brand logo
   */
  const handleSetAsLogo = useCallback(
    async (ingredient: IIngredient) => {
      if (!brandId) {
        return notificationsService.error('No brand selected');
      }

      if (!ingredient.id) {
        return notificationsService.error('Ingredient ID is required');
      }

      setActionStates((prev) => ({ ...prev, isSettingAsLogo: true }));
      const url = `POST /assets/from-ingredient [logo from image]`;

      try {
        const assetsService = await getAssetsService();
        const response = await assetsService.postFromIngredient({
          category: AssetCategory.LOGO,
          ingredientId: ingredient.id,
          parent: brandId,
        });

        logger.info(`${url} success`);

        setActionStates((prev) => ({ ...prev, isSettingAsLogo: false }));

        if (response?.id) {
          setPendingAssetId(response.id);
          setPendingAssetCategory(AssetCategory.LOGO);
        }

        notificationsService.success('Logo set successfully');

        if (onRefresh) {
          await onRefresh();
        }
      } catch (error: any) {
        logger.error(`${url} failed`, error);
        notificationsService.error('Failed to set as logo');
        setActionStates((prev) => ({ ...prev, isSettingAsLogo: false }));
        setPendingAssetId(null);
        setPendingAssetCategory(null);
      }
    },
    [brandId, onRefresh, getAssetsService, notificationsService],
  );

  /**
   * Set an image as brand banner
   */
  const handleSetAsBanner = useCallback(
    async (ingredient: IIngredient) => {
      if (!brandId) {
        return notificationsService.error('No brand selected');
      }

      if (!ingredient.id) {
        return notificationsService.error('Ingredient ID is required');
      }

      setActionStates((prev) => ({ ...prev, isSettingAsBanner: true }));
      const url = `POST /assets/from-ingredient [banner from image]`;

      try {
        const service = await getAssetsService();
        const data = await service.postFromIngredient({
          category: AssetCategory.BANNER,
          ingredientId: ingredient.id,
          parent: brandId,
        });

        logger.info(`${url} success`);

        setActionStates((prev) => ({ ...prev, isSettingAsBanner: false }));

        if (data?.id) {
          setPendingAssetId(data.id);
          setPendingAssetCategory(AssetCategory.BANNER);
        }

        notificationsService.success('Banner set successfully');

        if (onRefresh) {
          await onRefresh();
        }
      } catch (error: any) {
        logger.error(`${url} failed`, error);
        notificationsService.error('Failed to set as banner');

        setActionStates((prev) => ({ ...prev, isSettingAsBanner: false }));
        setPendingAssetId(null);
        setPendingAssetCategory(null);
      }
    },
    [brandId, onRefresh, getAssetsService, notificationsService],
  );

  /**
   * Share an ingredient by copying its URL to clipboard
   */
  const handleShare = useCallback(
    async (ingredient: IIngredient) => {
      if (onShare) {
        return await onShare(ingredient);
      }

      if (!ingredient || !ingredient.category) {
        return;
      }

      try {
        // Create URL to ingredient detail page
        const url = `${EnvironmentService.apps.app}/${ingredient.category}s/${ingredient.id}`;
        await clipboardService.copyToClipboard(url);
        notificationsService.success('Link copied to clipboard');
      } catch (error: any) {
        logger.error('Failed to share ingredient', error);
        notificationsService.error('Failed to copy link');
      }
    },
    [clipboardService, notificationsService, onShare],
  );

  /**
   * Copy prompt text to clipboard
   */
  const handleCopyPrompt = useCallback(
    async (ingredient: IIngredient) => {
      if (onCopyPrompt) {
        return await onCopyPrompt(ingredient);
      }

      if (!ingredient?.promptText) {
        return notificationsService.info('No prompt to copy');
      }

      try {
        await clipboardService.copyToClipboard(ingredient.promptText);
        notificationsService.success('Prompt copied to clipboard');
      } catch (error: any) {
        logger.error('Failed to copy prompt', error);
        notificationsService.error('Failed to copy prompt');
      }
    },
    [clipboardService, notificationsService, onCopyPrompt],
  );

  /**
   * Reprompt - regenerate with same settings
   */
  const handleReprompt = useCallback(
    async (ingredient: IIngredient) => {
      if (onReprompt) {
        return await onReprompt(ingredient);
      }

      // Default implementation - parent should provide onReprompt callback
      notificationsService.info(
        'Reprompt feature requires custom implementation',
      );
    },
    [notificationsService, onReprompt],
  );

  /**
   * Navigate to ingredient detail page
   */
  const handleSeeDetails = useCallback(
    async (ingredient: IIngredient) => {
      if (onSeeDetails) {
        return await onSeeDetails(ingredient);
      }
    },
    [onSeeDetails],
  );

  /**
   * Update sharing settings for an ingredient
   */
  const handleUpdateSharing = useCallback(
    async (ingredient: IIngredient, field: string, value: boolean | string) => {
      if (onUpdateSharing) {
        return await onUpdateSharing(ingredient, field, value);
      }

      await withServiceOperation({
        errorMessage: 'Failed to update sharing settings',
        onSuccess: onRefresh,
        operation: async () => {
          const service = await getIngredientsService();
          return service.patch(ingredient.id, { [field]: value } as Record<
            string,
            unknown
          >);
        },
        successMessage: 'Sharing settings updated',
        url: `PATCH /ingredients/${ingredient.id} [${field}]`,
      });
    },
    [onRefresh, onUpdateSharing, getIngredientsService],
  );

  /**
   * Update metadata for an ingredient
   */
  const handleUpdateMetadata = useCallback(
    async (ingredient: IIngredient, field: string, value: string) => {
      if (onUpdateMetadata) {
        return await onUpdateMetadata(ingredient, field, value);
      }

      if (!ingredient || !ingredient.metadata) {
        return;
      }
      if (typeof ingredient.metadata !== 'object') {
        return;
      }

      await withServiceOperation({
        errorMessage: 'Failed to update metadata',
        onSuccess: onRefresh,
        operation: async () => {
          const service = await getIngredientsService();
          const updatedMetadata: IMetadata = {
            ...(ingredient.metadata as IMetadata),
            [field]: value,
          };
          return service.patchMetadata(ingredient.id, updatedMetadata);
        },
        successMessage: 'Metadata updated successfully',
        url: `PATCH /ingredients/${ingredient.id}/metadata [${field}]`,
      });
    },
    [onRefresh, onUpdateMetadata, getIngredientsService],
  );

  /**
   * Update parent relationship for an ingredient
   */
  const handleUpdateParent = useCallback(
    async (ingredient: IIngredient, parentId: string | null) => {
      if (onUpdateParent) {
        return await onUpdateParent(ingredient, parentId);
      }

      await withServiceOperation({
        errorMessage: 'Failed to update parent relationship',
        onSuccess: onRefresh,
        operation: async () => {
          const service = await getIngredientsService();
          return service.patch(ingredient.id, {
            parent: parentId ? parentId : undefined,
          });
        },
        successMessage: 'Parent relationship updated',
        url: `PATCH /ingredients/${ingredient.id} [parent]`,
      });
    },
    [onRefresh, onUpdateParent, getIngredientsService],
  );

  return {
    actionStates,
    clearEnhanceConfirm,
    clearUpscaleConfirm,
    // Enhance confirm modal data
    enhanceConfirmData,
    enhanceConfirmMessage,
    executeEnhance,
    executeUpscale,
    handlers: {
      handleAddTextOverlay,
      handleClone,
      handleConvertToGif,
      handleConvertToVideo,
      handleCopyPrompt,
      handleDelete,
      handleDownload,
      handleEnhance,
      handleGenerateCaptions,
      handleLandscape,
      handleMarkArchived,
      handleMarkRejected,
      handleMarkValidated,
      handleMirror,
      handlePortrait,
      handlePublish,
      handleReprompt,
      handleReverse,
      handleSeeDetails,
      handleSetAsBanner,
      handleSetAsLogo,
      handleShare,
      handleSquare,
      handleUpdateMetadata,
      handleUpdateParent,
      handleUpdateSharing,
      handleUpscale,
      handleUseAsVideoReference,
      handleVote,
    },
    loadingStates: {
      isAddingTextOverlay: actionStates.isAddingTextOverlay,
      isCloning: actionStates.isCloning,
      isConverting: actionStates.isConverting,
      isConvertingToVideo: actionStates.isConvertingToVideo,
      isDeleting: actionStates.isDeleting,
      isDownloading: actionStates.isDownloading,
      isEnhancing: actionStates.isEnhancing,
      isGeneratingCaptions: actionStates.isGeneratingCaptions,
      isLandscaping: actionStates.isLandscaping,
      isMarkingArchived: actionStates.isMarkingArchived,
      isMarkingRejected: actionStates.isMarkingRejected,
      isMarkingValidated: actionStates.isMarkingValidated,
      isMirroring: actionStates.isMirroring,
      isPortraiting: actionStates.isPortraiting,
      isPublishing: actionStates.isPublishing,
      isReversing: actionStates.isReversing,
      isSettingAsBanner: actionStates.isSettingAsBanner,
      isSettingAsLogo: actionStates.isSettingAsLogo,
      isSquaring: actionStates.isSquaring,
      isUpscaling: actionStates.isUpscaling,
      isVoting: actionStates.isVoting,
    },
    setActionStates,
    setShowActions,
    showActions,
    // Upscale confirm modal data
    upscaleConfirmData,
    upscaleConfirmMessage,
  };
}

export default useIngredientActions;
