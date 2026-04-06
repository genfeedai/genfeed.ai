'use client';

import type { AssetScope } from '@genfeedai/enums';
import {
  IngredientCategory,
  ModalEnum,
  WebSocketEventStatus,
} from '@genfeedai/enums';
import type {
  IFilters,
  IFolder,
  IIngredient,
  IMediaEventData,
} from '@genfeedai/interfaces';
import { formatNumberWithCommas } from '@helpers/formatting/format/format.helper';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import useIngredientActions from '@hooks/ui/ingredient/use-ingredient-actions/use-ingredient-actions';
import { useSocketManager } from '@hooks/utils/use-socket-manager/use-socket-manager';
import {
  useConfirmModal,
  useIngredientOverlay,
  usePostModal,
  useUploadModal,
} from '@providers/global-modals/global-modals.provider';
import { IngredientsService } from '@services/content/ingredients.service';
import { logger } from '@services/core/logger.service';
import type { NotificationsService } from '@services/core/notifications.service';
import { VideosService } from '@services/ingredients/videos.service';
import { PageScope } from '@ui-constants/misc.constant';
import { WebSocketPaths } from '@utils/network/websocket.util';
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import { useCallback, useEffect, useState } from 'react';

interface UseIngredientsActionsProps {
  type: string;
  scope: PageScope;
  brandId?: string | null;
  singularType: string;
  formatFilter?: string;
  query: IFilters;
  searchParamsString: string;
  pathname: string;
  router: AppRouterInstance;
  ingredients: IIngredient[];
  setIngredients: Dispatch<SetStateAction<IIngredient[]>>;
  selectedFolderId?: string;
  setSelectedFolderId: Dispatch<SetStateAction<string | undefined>>;
  setQuery: (query: IFilters) => void;
  notificationsService: NotificationsService;
  findAllIngredientsByCategory: (
    isRefreshing?: boolean,
    signal?: AbortSignal,
  ) => Promise<void>;
  findAllFolders: (signal?: AbortSignal) => Promise<void>;
  getBulkIngredientsService: () => Promise<IngredientsService>;
  socketSubscriptionsRef: RefObject<Array<() => void>>;
  onConvertToVideo: (ingredient: IIngredient) => void;
}

export function useIngredientsActions({
  type,
  scope,
  brandId,
  singularType,
  query,
  searchParamsString,
  pathname,
  router,
  setIngredients,
  setSelectedFolderId,
  setQuery,
  notificationsService,
  findAllIngredientsByCategory,
  findAllFolders,
  getBulkIngredientsService,
  socketSubscriptionsRef,
  onConvertToVideo,
}: UseIngredientsActionsProps) {
  const { isReady: isSocketReady, subscribe } = useSocketManager();

  const { openConfirm } = useConfirmModal();
  const { openIngredientOverlay: openGlobalIngredientOverlay } =
    useIngredientOverlay();
  const { openUpload } = useUploadModal();

  const getIngredientsService = useAuthedService((token) =>
    IngredientsService.getInstance(type, token),
  );

  const getVideosService = useAuthedService((token: string) =>
    VideosService.getInstance(token),
  );

  const [isMerging, setIsMerging] = useState(false);
  const [selectedIngredientIds, setSelectedIngredientIds] = useState<string[]>(
    [],
  );
  const [selectedFolderForModal, setSelectedFolderForModal] =
    useState<IFolder | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const handleClose = useCallback(() => {
    findAllIngredientsByCategory(true);
  }, [findAllIngredientsByCategory]);

  const confirmDeleteIngredient = useCallback(
    async (ingredient: IIngredient) => {
      const url = `DELETE /ingredients/${ingredient.id}`;

      try {
        const service = await getIngredientsService();
        await service.delete(ingredient.id);

        logger.info(`${url} success`);
        notificationsService.success('Ingredient deleted successfully');
        findAllIngredientsByCategory(true);
      } catch (error) {
        logger.error(`${url} failed`, error);
        notificationsService.error('Failed to delete ingredient');
      }
    },
    [
      findAllIngredientsByCategory,
      getIngredientsService,
      notificationsService.error,
      notificationsService.success,
    ],
  );

  const handleDeleteIngredient = useCallback(
    (ingredient: IIngredient) => {
      openConfirm({
        confirmLabel: 'Delete',
        isError: true,
        label: 'Delete Ingredient',
        message:
          'Are you sure you want to delete this ingredient? This action cannot be undone.',
        onConfirm: () => confirmDeleteIngredient(ingredient),
      });
    },
    [confirmDeleteIngredient, openConfirm],
  );

  const {
    handlers,
    loadingStates,
    upscaleConfirmData,
    executeUpscale,
    clearUpscaleConfirm,
  } = useIngredientActions({
    onConvertToVideo,
    onDeleteIngredient: handleDeleteIngredient,
    onPublishIngredient: (ingredient: IIngredient) =>
      openIngredientModal(ModalEnum.POST, ingredient),
    onRefresh: () => findAllIngredientsByCategory(true),
    onSeeDetails: (ingredient: IIngredient) => {
      openGlobalIngredientOverlay(ingredient, handleClose);
    },
    onUpdateParent: async (
      ingredient: IIngredient,
      parentId: string | null,
    ) => {
      const isParentRelationshipUpdate = parentId !== ingredient.id;

      if (isParentRelationshipUpdate) {
        const url = `PATCH /ingredients/${ingredient.id}`;

        try {
          const service = await getBulkIngredientsService();
          await service.patch(ingredient.id, {
            parent: parentId || undefined,
          });

          logger.info(`${url} success - parent updated`);

          setIngredients((prevIngredients) =>
            prevIngredients.map((ing) =>
              ing.id === ingredient.id
                ? { ...ing, parent: parentId || undefined }
                : ing,
            ),
          );

          findAllIngredientsByCategory(true);
        } catch (error) {
          logger.error(`${url} failed`, error);
          notificationsService.error('Failed to update ingredient parent');

          setIngredients((prevIngredients) =>
            prevIngredients.map((ing) =>
              ing.id === ingredient.id
                ? { ...ing, parent: ingredient.parent }
                : ing,
            ),
          );
        }
      }
    },
  });

  const { openPostBatchModal } = usePostModal({
    onRefresh: () => findAllIngredientsByCategory(true),
  });

  useEffect(() => {
    if (upscaleConfirmData) {
      const ingredientCategory =
        upscaleConfirmData.ingredient?.category === IngredientCategory.VIDEO
          ? 'video'
          : 'image';

      const message = `Upscale ${ingredientCategory} with Topaz AI?\n\nThis will cost ${formatNumberWithCommas(
        upscaleConfirmData.cost,
      )} credits.`;

      openConfirm({
        cancelLabel: 'Cancel',
        confirmLabel: 'Upscale',
        label: 'Confirm Upscale',
        message,
        onClose: () => {
          clearUpscaleConfirm();
        },
        onConfirm: async () => {
          await executeUpscale();
        },
      });
    }
  }, [clearUpscaleConfirm, executeUpscale, openConfirm, upscaleConfirmData]);

  const confirmBulkDelete = useCallback(async () => {
    if (selectedIngredientIds.length === 0) {
      return;
    }

    const url = 'POST /ingredients/bulk-delete';

    try {
      const service = await getBulkIngredientsService();
      const data = await service.bulkDelete({
        ids: selectedIngredientIds,
        type: 'ingredients-delete',
      });

      logger.info(`${url} success`, data);

      if (data.deleted && data.deleted.length > 0) {
        notificationsService.success(
          data.message ||
            `Successfully deleted ${data.deleted.length} ingredient(s)`,
        );

        setSelectedIngredientIds([]);
        findAllIngredientsByCategory(true);
      }

      if (data.failed && data.failed.length > 0) {
        notificationsService.error(
          `Failed to delete ${data.failed.length} ingredient(s). You may not have permission to delete them.`,
        );
      }
    } catch (error) {
      logger.error(`${url} failed`, error);
      notificationsService.error('Failed to delete selected ingredients');
    }
  }, [
    findAllIngredientsByCategory,
    getBulkIngredientsService,
    notificationsService,
    selectedIngredientIds,
  ]);

  const handleArchiveIngredient = useCallback(
    async (ingredient: IIngredient) => {
      await handlers.handleMarkArchived(ingredient);
    },
    [handlers],
  );

  const handleConvertToPortrait = useCallback(
    async (ingredient: IIngredient) => {
      await handlers.handlePortrait(ingredient);
    },
    [handlers],
  );

  const handleGenerateCaptions = useCallback(
    async (ingredient: IIngredient) => {
      await handlers.handleGenerateCaptions(ingredient);
    },
    [handlers],
  );

  const handleSeeDetails = useCallback(
    (ingredient: IIngredient) => {
      handlers.handleSeeDetails(ingredient);
    },
    [handlers],
  );

  const handleUpdateParent = useCallback(
    async (ingredient: IIngredient, parentId: string | null) => {
      await handlers.handleUpdateParent(ingredient, parentId);
    },
    [handlers],
  );

  const handleSelectFolder = useCallback(
    (folder: IFolder | null) => {
      const folderId = folder?.id;

      setSelectedFolderId((prev) => {
        if (folderId === prev) {
          return prev;
        }
        return folderId;
      });

      setQuery({
        ...query,
        folder: folderId,
      });

      const params = new URLSearchParams(searchParamsString);

      if (folderId) {
        params.set('folder', folderId);
      } else {
        params.delete('folder');
      }

      const queryString = params.toString();
      const newUrl = queryString ? `${pathname}?${queryString}` : pathname;
      const currentSearch = window.location.search;
      const expectedSearch = queryString ? `?${queryString}` : '';

      if (currentSearch !== expectedSearch) {
        router.replace(newUrl, { scroll: false });
      }
    },
    [
      pathname,
      query,
      router,
      searchParamsString,
      setQuery,
      setSelectedFolderId,
    ],
  );

  const handleFolderDrop = useCallback(
    async (ingredient: IIngredient, folder: IFolder | null) => {
      const url = `PATCH /ingredients/${ingredient.id}`;
      const folderId = folder?.id ?? undefined;

      setIngredients((prevIngredients) =>
        prevIngredients.map((ing) =>
          ing.id === ingredient.id ? { ...ing, folder: folderId } : ing,
        ),
      );

      try {
        const service = await getBulkIngredientsService();
        await service.patch(ingredient.id, {
          folder: folderId,
        });

        logger.info(`${url} success - folder updated`);

        findAllIngredientsByCategory(true);
      } catch (error) {
        logger.error(`${url} failed`, error);
        notificationsService.error('Failed to move ingredient to folder');

        setIngredients((prevIngredients) =>
          prevIngredients.map((ing) =>
            ing.id === ingredient.id
              ? { ...ing, folder: ingredient.folder }
              : ing,
          ),
        );
      }
    },
    [
      findAllIngredientsByCategory,
      getBulkIngredientsService,
      notificationsService,
      setIngredients,
    ],
  );

  const handleCreateFolder = useCallback(() => {
    setSelectedFolderForModal(null);
    openModal(ModalEnum.FOLDER);
  }, []);

  const handleFolderModalConfirm = useCallback(
    (isRefreshing?: boolean) => {
      setSelectedFolderForModal(null);
      findAllFolders();
      if (isRefreshing) {
        findAllIngredientsByCategory(true);
      }
    },
    [findAllFolders, findAllIngredientsByCategory],
  );

  const openIngredientModal = useCallback(
    (modalId: ModalEnum, ingredient?: IIngredient) => {
      if (modalId === ModalEnum.INGREDIENT && ingredient) {
        return openGlobalIngredientOverlay(ingredient, handleClose);
      }

      if (modalId === ModalEnum.POST && ingredient) {
        return openPostBatchModal(ingredient);
      }

      if (modalId === ModalEnum.CONFIRM && ingredient) {
        return handleDeleteIngredient(ingredient);
      }

      if (modalId === ModalEnum.UPLOAD) {
        openUpload({
          category: singularType,
          onConfirm: () => findAllIngredientsByCategory(true),
          parentId:
            scope === PageScope.SUPERADMIN ? undefined : (brandId ?? undefined),
          parentModel: scope === PageScope.SUPERADMIN ? undefined : 'Brand',
        });
        return;
      }

      openModal(modalId);
    },
    [
      brandId,
      findAllIngredientsByCategory,
      handleClose,
      handleDeleteIngredient,
      openGlobalIngredientOverlay,
      openPostBatchModal,
      openUpload,
      scope,
      singularType,
    ],
  );

  const handleMerge = useCallback(async () => {
    if (selectedIngredientIds.length < 2) {
      return logger.error('Cannot merge: need at least 2 ingredients selected');
    }

    setIsMerging(true);
    const url = 'POST /ingredients/merge';

    try {
      const service = await getVideosService();

      const media = await service.postMerge({
        category: singularType,
        ids: selectedIngredientIds,
      });

      logger.info(`${url} success`, media);

      if (media?.id && isSocketReady) {
        const mergeEventPath = WebSocketPaths.video(media.id);

        let unsubscribe: (() => void) | null = null;

        const handleMergeResult = (data: IMediaEventData) => {
          logger.info('Merge result received:', data);

          switch (data.status as WebSocketEventStatus) {
            case WebSocketEventStatus.COMPLETED:
              notificationsService.success('Videos merged successfully!');
              findAllIngredientsByCategory(true);
              setIsMerging(false);

              if (unsubscribe) {
                unsubscribe();
                socketSubscriptionsRef.current =
                  socketSubscriptionsRef.current.filter(
                    (unsub) => unsub !== unsubscribe,
                  );
              }
              break;
            default:
              notificationsService.error('Video merge failed');
              setIsMerging(false);
              if (unsubscribe) {
                unsubscribe();
                socketSubscriptionsRef.current =
                  socketSubscriptionsRef.current.filter(
                    (unsub) => unsub !== unsubscribe,
                  );
              }
              break;
          }
        };

        unsubscribe = subscribe(mergeEventPath, handleMergeResult);
        if (unsubscribe) {
          socketSubscriptionsRef.current.push(unsubscribe);
        }
      }

      setSelectedIngredientIds([]);
      findAllIngredientsByCategory(true);
    } catch (error) {
      logger.error(`${url} failed`, error);
      notificationsService.error('Failed to merge videos');
      setIsMerging(false);
    }
  }, [
    findAllIngredientsByCategory,
    getVideosService,
    notificationsService,
    selectedIngredientIds,
    singularType,
    isSocketReady,
    subscribe,
    socketSubscriptionsRef,
  ]);

  const handleClearSelection = useCallback(() => {
    setSelectedIngredientIds([]);
  }, []);

  const handleBulkDelete = useCallback(() => {
    if (selectedIngredientIds.length === 0) {
      return;
    }

    openConfirm({
      confirmLabel: 'Delete',
      isError: true,
      label: `Delete ${selectedIngredientIds.length} Ingredient${selectedIngredientIds.length !== 1 ? 's' : ''}`,
      message: `Are you sure you want to delete ${selectedIngredientIds.length} selected ingredient${selectedIngredientIds.length !== 1 ? 's' : ''}? This action cannot be undone.`,
      onConfirm: confirmBulkDelete,
    });
  }, [confirmBulkDelete, openConfirm, selectedIngredientIds.length]);

  const openLightboxForIngredient = useCallback(
    (ingredient: IIngredient, mediaIngredients: IIngredient[]) => {
      const index = mediaIngredients.findIndex(
        (ing) => ing.id === ingredient.id,
      );

      if (index >= 0) {
        setLightboxIndex(index);
        setLightboxOpen(true);
        return true;
      }

      return false;
    },
    [],
  );

  const closeLightbox = useCallback(() => {
    setLightboxOpen(false);
  }, []);

  const handleScopeChange = useCallback(
    async (newScope: AssetScope, updatedIngredient?: IIngredient) => {
      if (!updatedIngredient) {
        return await findAllIngredientsByCategory(true);
      }

      const nextIngredient: IIngredient = {
        ...updatedIngredient,
        scope: newScope,
      };

      setIngredients((prevIngredients) =>
        prevIngredients.map((ingredient: IIngredient) =>
          ingredient.id === nextIngredient.id ? nextIngredient : ingredient,
        ),
      );
    },
    [findAllIngredientsByCategory, setIngredients],
  );

  const handleRefresh = useCallback(
    async (isRefreshing?: boolean) => {
      await findAllIngredientsByCategory(Boolean(isRefreshing));
    },
    [findAllIngredientsByCategory],
  );

  return {
    closeLightbox,
    handleArchiveIngredient,
    handleBulkDelete,
    handleClearSelection,
    handleConvertToPortrait,
    handleCopyPrompt: handlers.handleCopyPrompt,
    handleCreateFolder,
    handleDeleteIngredient,
    handleFolderDrop,
    handleFolderModalConfirm,
    handleGenerateCaptions,
    handleMerge,
    handleMirror: handlers.handleMirror,
    handleRefresh,
    handleReprompt: handlers.handleReprompt,
    handleReverse: handlers.handleReverse,
    handleScopeChange,
    handleSeeDetails,
    handleSelectFolder,
    handleUpdateParent,
    isGeneratingCaptions: loadingStates.isGeneratingCaptions,
    isMerging,
    isMirroring: loadingStates.isMirroring,
    isPortraiting: loadingStates.isPortraiting,
    isReversing: loadingStates.isReversing,
    lightboxIndex,
    lightboxOpen,
    openIngredientModal,
    openLightboxForIngredient,
    selectedFolderForModal,
    selectedIngredientIds,
    setSelectedIngredientIds,
  };
}
