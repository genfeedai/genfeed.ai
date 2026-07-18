import { APP_ROUTES } from '@genfeedai/constants';
import {
  useConfirmModal,
  usePostModal,
} from '@genfeedai/contexts/providers/global-modals/global-modals.provider';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import {
  type AssetScope,
  IngredientCategory,
  IngredientStatus,
  ModalEnum,
} from '@genfeedai/enums';
import { formatNumberWithCommas } from '@genfeedai/helpers/formatting/format/format.helper';
import { closeModal } from '@genfeedai/helpers/ui/modal/modal.helper';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { useFeatureFlag } from '@genfeedai/hooks/feature-flags/use-feature-flag';
import { stopAndResetVideo } from '@genfeedai/hooks/media/video-utils/video.utils';
import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import { useIngredientActions } from '@genfeedai/hooks/ui/ingredient/use-ingredient-actions/use-ingredient-actions';
import { useModalAutoOpen } from '@genfeedai/hooks/ui/use-modal-auto-open/use-modal-auto-open';
import type { IIngredient, IMetadata } from '@genfeedai/interfaces';
import type { IngredientOverlayProps } from '@genfeedai/props/modals/modal.props';
import { IngredientsService } from '@genfeedai/services/content/ingredients.service';
import { ClipboardService } from '@genfeedai/services/core/clipboard.service';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { GIFsService } from '@genfeedai/services/ingredients/gifs.service';
import { ImagesService } from '@genfeedai/services/ingredients/images.service';
import { VideosService } from '@genfeedai/services/ingredients/videos.service';
import {
  isImageIngredient,
  isVideoIngredient,
} from '@genfeedai/utils/media/ingredient-type.util';
import { buildContextualRemixHref } from '@genfeedai/utils/url/contextual-remix-url.util';
import { buildAgentPromptHref } from '@genfeedai/utils/url/desktop-loop-url.util';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

export function useModalIngredient({
  ingredient,
  onConfirm,
  isOpen,
  openKey,
  onClose,
}: IngredientOverlayProps) {
  const { isSignedIn } = useAuthIdentity();
  const { push } = useRouter();
  const { href } = useOrgUrl();
  const { credentials } = useBrand();
  const isStudioEnabled = useFeatureFlag('studio');
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const getIngredientsService = useAuthedService((token: string) =>
    IngredientsService.getInstance(token),
  );

  const getVideosService = useAuthedService((token: string) =>
    VideosService.getInstance(token),
  );

  const getImagesService = useAuthedService((token: string) =>
    ImagesService.getInstance(token),
  );

  const getGifsService = useAuthedService((token: string) =>
    GIFsService.getInstance(token),
  );

  const notificationsService = NotificationsService.getInstance();
  const clipboardService = ClipboardService.getInstance();

  const shouldAutoOpen = isOpen ?? Boolean(ingredient);
  useModalAutoOpen(ModalEnum.INGREDIENT, {
    isOpen: shouldAutoOpen,
    openKey,
  });

  const [localIngredient, setLocalIngredient] = useState<IIngredient | null>(
    ingredient || null,
  );
  const [showTextOverlayPanel, setShowTextOverlayPanel] = useState(false);
  const [viewingChild, setViewingChild] = useState<IIngredient | null>(null);
  const [parentIngredient, setParentIngredient] = useState<IIngredient | null>(
    ingredient || null,
  );
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const metadata =
    typeof localIngredient?.metadata === 'object' && localIngredient?.metadata
      ? (localIngredient.metadata as IMetadata)
      : null;
  const metadataLabel = metadata?.label;
  const ingredientTitle = metadataLabel || localIngredient?.id || 'Ingredient';
  const ingredientDescription = localIngredient
    ? `${localIngredient.category} detail opened in context.`
    : 'Ingredient detail opened in context.';

  const isVideo = isVideoIngredient(localIngredient);
  const isImage = isImageIngredient(localIngredient);

  const { openPostBatchModal } = usePostModal();
  const { openConfirm } = useConfirmModal();

  const {
    handlers,
    loadingStates,
    upscaleConfirmData,
    executeUpscale,
    clearUpscaleConfirm,
  } = useIngredientActions({
    onPublishIngredient: (ing: IIngredient) => openPostBatchModal(ing),
    onRefresh: async () => {
      if (ingredient?.id) {
        await findAllIngredientChildren(ingredient.id);
        onConfirm?.();
      }
    },
    onSeeDetails: (ing: IIngredient) => {
      if (childIngredients.some((child) => child.id === ing.id)) {
        setViewingChild(ing);
        setLocalIngredient(ing);
        findAllIngredientChildren(ing.id);
      } else {
        closeModal(ModalEnum.INGREDIENT);
        const routeType = `${ing.category.toLowerCase()}s`;
        push(href(`/${routeType}/${ing.id}`));
      }
    },
    onShare: async (ing: IIngredient) => {
      if (!ing?.category) {
        return;
      }

      const url = `${EnvironmentService.apps.app}/${ing.category}s/${ing.id}`;
      await clipboardService.copyToClipboard(url);

      notificationsService.success('Link copied to clipboard');
    },
    onUpdateMetadata: async (
      _ingredient: IIngredient,
      field: string,
      value: string,
    ) => {
      if (!localIngredient?.metadata) {
        return;
      }

      if (typeof localIngredient.metadata !== 'object') {
        return;
      }

      const originalMetadata = localIngredient.metadata as IMetadata;

      const updatedMetadata: IMetadata = {
        ...(localIngredient.metadata as IMetadata),
        [field]: value,
      };

      setLocalIngredient((prev) =>
        prev
          ? {
              ...prev,
              metadata: updatedMetadata,
            }
          : prev,
      );

      setIsUpdating(true);

      try {
        const service = await getIngredientsService();
        await service.patchMetadata(localIngredient.id, updatedMetadata);

        notificationsService.success('Updated successfully');
        setIsUpdating(false);
      } catch (err) {
        logger.error('Failed to update metadata', err);
        setError('Failed to update');
        setLocalIngredient((prev) =>
          prev
            ? {
                ...prev,
                metadata: originalMetadata,
              }
            : prev,
        );

        setIsUpdating(false);
      }
    },
    onUpdateSharing: async (
      _ingredient: IIngredient,
      field: string,
      value: boolean | string,
    ) => {
      if (!localIngredient) {
        return;
      }

      const fieldKey = field as keyof IIngredient;
      const originalValue = localIngredient[fieldKey];

      setLocalIngredient((prev) =>
        prev
          ? {
              ...prev,
              [field]: value,
            }
          : prev,
      );

      setIsUpdating(true);

      try {
        const service = await getIngredientsService();
        await service.patch(localIngredient.id, {
          [field]: value,
        } as Record<string, boolean | string>);

        setIsUpdating(false);
      } catch (err) {
        logger.error('Failed to update sharing settings', err);
        setError('Failed to update sharing settings');

        setLocalIngredient((prev) =>
          prev
            ? {
                ...prev,
                [field]: originalValue,
              }
            : prev,
        );

        setIsUpdating(false);
      }
    },
  });

  // Watch for upscale confirmation and open modal
  useEffect(() => {
    if (upscaleConfirmData) {
      const ingredientCategory =
        upscaleConfirmData.ingredient?.category === IngredientCategory.VIDEO
          ? 'video'
          : 'image';
      const message = `Upscale ${ingredientCategory} with Topaz AI?\n\nThis will cost ${formatNumberWithCommas(upscaleConfirmData.cost)} credits.`;

      openConfirm({
        cancelLabel: 'Cancel',
        confirmLabel: 'Upscale',
        label: 'Confirm Upscale',
        message: message,
        onClose: () => {
          clearUpscaleConfirm();
        },
        onConfirm: async () => {
          await executeUpscale();
        },
      });
    }
  }, [upscaleConfirmData, openConfirm, executeUpscale, clearUpscaleConfirm]);

  // Sync local state when ingredient prop changes
  useEffect(() => {
    if (!ingredient) {
      return;
    }
    setLocalIngredient(ingredient);
    setParentIngredient(ingredient);
    setViewingChild(null);
  }, [ingredient?.id, ingredient]);

  const handleCreateVariation = useCallback(
    (image: IIngredient) => {
      if (!image) {
        return;
      }

      if (image.status === IngredientStatus.PROCESSING) {
        return notificationsService.info(
          'Please wait until the image has finished processing',
        );
      }

      closeModal(ModalEnum.INGREDIENT);
      push(
        href(
          buildContextualRemixHref(APP_ROUTES.POSTS.REMIX, {
            kind: 'ingredient',
            recordId: image.id,
            recordVersion: image.version?.toString(),
          }),
        ),
      );
    },
    [notificationsService, push, href],
  );

  const handleUsePrompt = useCallback(
    (ingredientToUse: IIngredient) => {
      if (!ingredientToUse) {
        return;
      }

      if (!ingredientToUse.promptText) {
        return notificationsService.info('No prompt available to use');
      }

      if (!isStudioEnabled) {
        closeModal(ModalEnum.INGREDIENT);
        push(href(buildAgentPromptHref(ingredientToUse.promptText)));
        return;
      }

      const isIngredientVideo =
        ingredientToUse.category === IngredientCategory.VIDEO;
      const targetRoute = isIngredientVideo ? '/studio/video' : '/studio/image';

      import('@genfeedai/utils/url/prompt-config-url.util').then(
        ({ buildUsePromptUrl }) => {
          const url = buildUsePromptUrl(ingredientToUse, targetRoute);
          closeModal(ModalEnum.INGREDIENT);
          push(href(url));
        },
      );
    },
    [href, isStudioEnabled, notificationsService, push],
  );

  const getServiceForType = useCallback(
    async (type: IngredientCategory) => {
      switch (type) {
        case IngredientCategory.IMAGE:
          return getImagesService();
        case IngredientCategory.VIDEO:
          return getVideosService();
        case IngredientCategory.GIF:
          return getGifsService();
        default:
          return null;
      }
    },
    [getImagesService, getVideosService, getGifsService],
  );

  const ingredientChildrenKey = [
    'ingredient-children',
    ingredient?.id,
    ingredient?.category,
  ];

  const { data: childIngredients = [], refetch: refreshChildIngredients } =
    useQuery({
      queryKey: ingredientChildrenKey,
      queryFn: async (): Promise<IIngredient[]> => {
        const type = ingredient?.category;
        if (!type || !ingredient?.id) {
          return [];
        }

        const service = await getServiceForType(type);
        if (!service) {
          return [];
        }

        return (await service.findChildren(
          ingredient.id,
        )) as unknown as IIngredient[];
      },
      enabled: !!isSignedIn && !!ingredient?.id,
    });

  const findAllIngredientChildren = useCallback(
    async (_parentId: string) => {
      await refreshChildIngredients();
    },
    [refreshChildIngredients],
  );

  const handleReload = async (skipNotification?: boolean) => {
    if (ingredient?.id) {
      await findAllIngredientChildren(ingredient.id);

      onConfirm?.();

      if (!skipNotification) {
        notificationsService.success('Refreshed successfully');
      }
    }
  };

  const handleTextOverlaySuccess = () => {
    setShowTextOverlayPanel(false);
    handleReload(true);
  };

  const handleScopeChange = useCallback(
    async (scope: AssetScope, updatedIngredient?: IIngredient) => {
      if (updatedIngredient) {
        setLocalIngredient(updatedIngredient);
        notificationsService.success('Scope updated successfully');
      } else if (localIngredient) {
        const originalScope = localIngredient.scope;
        setLocalIngredient((prev) =>
          prev
            ? {
                ...prev,
                scope,
              }
            : prev,
        );
        setIsUpdating(true);

        try {
          const service = await getIngredientsService();
          const updated = await service.patch(localIngredient.id, {
            scope,
          });
          setLocalIngredient(updated as IIngredient);
          setIsUpdating(false);
          notificationsService.success('Scope updated successfully');
        } catch (err) {
          logger.error('Failed to update scope', err);
          setError('Failed to update scope');
          setLocalIngredient((prev) =>
            prev
              ? {
                  ...prev,
                  scope: originalScope,
                }
              : prev,
          );
          setIsUpdating(false);
        }
      }
    },
    [localIngredient, getIngredientsService, notificationsService],
  );

  const handleModalClose = () => {
    stopAndResetVideo(videoRef);
    setError(null);
    onClose?.();
  };

  const handleBackToParent = () => {
    setViewingChild(null);
    setLocalIngredient(parentIngredient);

    if (parentIngredient) {
      findAllIngredientChildren(parentIngredient.id);
    }
  };

  return {
    videoRef,
    credentials,
    localIngredient,
    showTextOverlayPanel,
    setShowTextOverlayPanel,
    viewingChild,
    isUpdating,
    error,
    metadataLabel,
    ingredientTitle,
    ingredientDescription,
    isVideo,
    isImage,
    childIngredients,
    handlers,
    loadingStates,
    handleCreateVariation,
    handleUsePrompt,
    handleReload,
    handleTextOverlaySuccess,
    handleScopeChange,
    handleModalClose,
    handleBackToParent,
  };
}
