'use client';

import { useAuth } from '@clerk/nextjs';
import {
  useConfirmModal,
  usePostModal,
} from '@genfeedai/contexts/providers/global-modals/global-modals.provider';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import {
  AlertCategory,
  type AssetScope,
  ButtonSize,
  ButtonVariant,
  IngredientCategory,
  IngredientStatus,
  ModalEnum,
} from '@genfeedai/enums';
import { formatNumberWithCommas } from '@genfeedai/helpers/formatting/format/format.helper';
import { closeModal } from '@genfeedai/helpers/ui/modal/modal.helper';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { useResource } from '@genfeedai/hooks/data/resource/use-resource/use-resource';
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
import Alert from '@ui/feedback/alert/Alert';
import IngredientDetailImage from '@ui/ingredients/detail-image/IngredientDetailImage';
import IngredientDetailVideo from '@ui/ingredients/detail-video/IngredientDetailVideo';
import TextOverlayPanel from '@ui/ingredients/text-overlay-panel/TextOverlayPanel';
import Loading from '@ui/loading/default/Loading';
import EntityOverlayShell from '@ui/overlays/entity/EntityOverlayShell';
import { Button } from '@ui/primitives/button';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

export default function IngredientOverlay({
  ingredient,
  onConfirm,
  isOpen,
  openKey,
  onClose,
}: IngredientOverlayProps) {
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const { href } = useOrgUrl();
  const { credentials } = useBrand();
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

  // Local state for the ingredient to allow optimistic updates
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
    onPublishIngredient: (ingredient: IIngredient) =>
      openPostBatchModal(ingredient),
    onRefresh: async () => {
      if (ingredient?.id) {
        await findAllIngredientChildren(ingredient.id);
        onConfirm?.();
      }
    },
    onSeeDetails: (ingredient: IIngredient) => {
      if (childIngredients.some((child) => child.id === ingredient.id)) {
        setViewingChild(ingredient);
        setLocalIngredient(ingredient);
        findAllIngredientChildren(ingredient.id);
      } else {
        closeModal(ModalEnum.INGREDIENT);
        const routeType = `${ingredient.category.toLowerCase()}s`;
        router.push(href(`/${routeType}/${ingredient.id}`));
      }
    },
    onShare: async (ingredient: IIngredient) => {
      if (!ingredient?.category) {
        return;
      }

      const url = `${EnvironmentService.apps.app}/${ingredient.category}s/${ingredient.id}`;
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

      setLocalIngredient({
        ...localIngredient,
        metadata: updatedMetadata,
      });

      setIsUpdating(true);

      try {
        const service = await getIngredientsService();
        await service.patchMetadata(localIngredient.id, updatedMetadata);

        notificationsService.success('Updated successfully');
        setIsUpdating(false);
      } catch (error) {
        logger.error('Failed to update metadata', error);
        setError('Failed to update');
        setLocalIngredient({
          ...localIngredient,
          metadata: originalMetadata,
        });

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

      const originalValue = (localIngredient as any)[field];

      setLocalIngredient({
        ...localIngredient,
        [field]: value,
      });

      setIsUpdating(true);

      try {
        const service = await getIngredientsService();
        await service.patch(localIngredient.id, {
          [field]: value,
        } as any);

        setIsUpdating(false);
      } catch (error) {
        logger.error('Failed to update sharing settings', error);
        setError('Failed to update sharing settings');

        setLocalIngredient({
          ...localIngredient,
          [field]: originalValue,
        });

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

  // Handle creating a variation (img2img) - navigate to Studio with the image as reference
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
      router.push(href(`/studio/image?referenceImageId=${image.id}`));
    },
    [router, notificationsService],
  );

  // Handle using prompt from ingredient - navigate to Studio with full config pre-filled
  const handleUsePrompt = useCallback(
    (ingredientToUse: IIngredient) => {
      if (!ingredientToUse) {
        return;
      }

      if (!ingredientToUse.promptText) {
        return notificationsService.info('No prompt available to use');
      }

      const isIngredientVideo =
        ingredientToUse.category === IngredientCategory.VIDEO;
      const targetRoute = isIngredientVideo ? '/studio/video' : '/studio/image';

      // Import dynamically to avoid circular dependency
      import('@genfeedai/utils/url/prompt-config-url.util').then(
        ({ buildUsePromptUrl }) => {
          const url = buildUsePromptUrl(ingredientToUse, targetRoute);
          closeModal(ModalEnum.INGREDIENT);
          router.push(href(url));
        },
      );
    },
    [router, notificationsService],
  );

  // Helper to get the appropriate service for the ingredient type
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

  // Load child ingredients using useResource (handles AbortController cleanup properly)
  const { data: childIngredients, refresh: refreshChildIngredients } =
    useResource(
      async (): Promise<IIngredient[]> => {
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
      {
        defaultValue: [] as IIngredient[],
        dependencies: [ingredient?.id, ingredient?.category],
        enabled: !!isSignedIn && !!ingredient?.id,
        onError: (error) => {
          logger.error('Failed to load child ingredients', error);
        },
      },
    );

  const findAllIngredientChildren = useCallback(
    async (_parentId: string) => {
      // Just refresh the useResource data
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
        // Fallback: update manually if updatedIngredient not provided
        const originalScope = localIngredient.scope;
        setLocalIngredient({
          ...localIngredient,
          scope,
        });
        setIsUpdating(true);

        try {
          const service = await getIngredientsService();
          const updated = await service.patch(localIngredient.id, {
            scope,
          } as any);
          setLocalIngredient(updated as IIngredient);
          setIsUpdating(false);
          notificationsService.success('Scope updated successfully');
        } catch (error) {
          logger.error('Failed to update scope', error);
          setError('Failed to update scope');
          setLocalIngredient({
            ...localIngredient,
            scope: originalScope,
          });
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

  return (
    <>
      <EntityOverlayShell
        id={ModalEnum.INGREDIENT}
        title={ingredientTitle}
        description={ingredientDescription}
        width="2xl"
        bodyClassName="px-0 py-0"
        onClose={handleModalClose}
        badges={
          localIngredient ? (
            <>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-foreground/55">
                Ingredient
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-foreground/70">
                {localIngredient.category}
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-foreground/70">
                {localIngredient.status}
              </span>
            </>
          ) : null
        }
      >
        {!localIngredient ? (
          <Loading isFullSize={false} />
        ) : (
          <div className="mx-auto flex h-auto max-w-[1520px] flex-col gap-4 p-4 md:p-6">
            {error ? (
              <Alert type={AlertCategory.ERROR}>
                <p>{error}</p>
              </Alert>
            ) : null}

            {localIngredient.status === IngredientStatus.ARCHIVED && (
              <Alert type={AlertCategory.WARNING}>
                <p>This ingredient is archived.</p>
              </Alert>
            )}

            {EnvironmentService.isDevelopment && (
              <Alert type={AlertCategory.INFO}>
                <p>Ingredient ID: {localIngredient.id}</p>
              </Alert>
            )}

            {viewingChild &&
              (() => {
                const childMetadata =
                  typeof viewingChild.metadata === 'object' &&
                  viewingChild.metadata
                    ? (viewingChild.metadata as IMetadata)
                    : null;

                return (
                  <Alert type={AlertCategory.INFO}>
                    <div className="flex justify-between items-center w-full gap-2">
                      <p>
                        Viewing child: {childMetadata?.label || 'Child Asset'}
                      </p>

                      <Button
                        label="Back to parent"
                        variant={ButtonVariant.GHOST}
                        size={ButtonSize.SM}
                        onClick={() => {
                          setViewingChild(null);
                          setLocalIngredient(parentIngredient);

                          if (parentIngredient) {
                            findAllIngredientChildren(parentIngredient.id);
                          }
                        }}
                      />
                    </div>
                  </Alert>
                );
              })()}

            <div className="rounded-3xl border border-white/8 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.015))] p-4 shadow-[0_32px_120px_rgba(0,0,0,0.4)] md:p-6">
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                {isVideo ? (
                  <IngredientDetailVideo
                    video={localIngredient}
                    videoRef={videoRef}
                    credentials={credentials}
                    childIngredients={childIngredients}
                    // Actions (Handlers)
                    onReload={handleReload}
                    // onSeeDetails={handlers.handleSeeDetails}
                    onShareVideo={() => handlers.handleShare(localIngredient!)}
                    // onGenerateCaptions={handlers.handleGenerateCaptions}
                    onPublishVideo={handlers.handlePublish}
                    onDownloadVideo={async (video) => {
                      await handlers.handleDownload(video);
                      return undefined;
                    }}
                    // onUpscaleVideo={handlers.handleUpscale}
                    // onCloneVideo={handlers.handleClone}
                    // onVoteIngredient={handlers.handleVote}
                    // onReverseVideo={handlers.handleReverse}
                    // onMirrorVideo={handlers.handleMirror}
                    // onPortraitVideo={handlers.handlePortrait}
                    // onConvertToGif={handlers.handleConvertToGif}
                    // onAddTextOverlay={() => setShowTextOverlayPanel(true)}
                    onUpdateMetadata={(field: string, value: string) =>
                      handlers.handleUpdateMetadata(
                        localIngredient!,
                        field,
                        value,
                      )
                    }
                    onUpdateSharing={(field: string, value: boolean | string) =>
                      handlers.handleUpdateSharing(
                        localIngredient!,
                        field,
                        value,
                      )
                    }
                    isPublishing={loadingStates.isPublishing}
                    isDownloading={loadingStates.isDownloading}
                    isUpscaling={loadingStates.isUpscaling}
                    isCloning={loadingStates.isCloning}
                    isVoting={loadingStates.isVoting}
                    isReversing={loadingStates.isReversing}
                    isMirroring={loadingStates.isMirroring}
                    isPortraiting={loadingStates.isPortraiting}
                    isConverting={loadingStates.isConverting}
                    isGeneratingCaptions={loadingStates.isGeneratingCaptions}
                    isAddingTextOverlay={loadingStates.isAddingTextOverlay}
                    onUsePrompt={handleUsePrompt}
                  />
                ) : isImage ? (
                  <IngredientDetailImage
                    childIngredients={childIngredients}
                    image={localIngredient as any}
                    isCloning={loadingStates.isCloning}
                    isConvertingToVideo={loadingStates.isConvertingToVideo}
                    isDownloading={loadingStates.isDownloading}
                    isPublishing={loadingStates.isPublishing}
                    isUpdating={isUpdating}
                    isUpscaling={loadingStates.isUpscaling}
                    isVoting={loadingStates.isVoting}
                    // onCloneImage={handlers.handleClone}
                    // onConvertToVideo={handlers.handleConvertToVideo}
                    onCreateVariation={handleCreateVariation}
                    onDownloadImage={async (image) => {
                      await handlers.handleDownload(image);
                      return undefined;
                    }}
                    onPublishImage={handlers.handlePublish}
                    // onSeeDetails={handlers.handleSeeDetails}
                    onShareImage={() => handlers.handleShare(localIngredient!)}
                    onUpdateMetadata={(field: string, value: string) =>
                      handlers.handleUpdateMetadata(
                        localIngredient!,
                        field,
                        value,
                      )
                    }
                    onUpdateSharing={(field: string, value: boolean | string) =>
                      handlers.handleUpdateSharing(
                        localIngredient!,
                        field,
                        value,
                      )
                    }
                    onScopeChange={handleScopeChange}
                    // onUpscaleImage={handlers.handleUpscale}
                    // onVoteIngredient={handlers.handleVote}
                    onUsePrompt={handleUsePrompt}
                  />
                ) : (
                  <div className="col-span-3 text-center">
                    <p className="text-lg mb-2">{metadataLabel}</p>

                    <p className="text-sm text-foreground/60">
                      {localIngredient.category}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </EntityOverlayShell>

      {localIngredient && isVideo && (
        <TextOverlayPanel
          video={localIngredient as any}
          isOpen={showTextOverlayPanel}
          onClose={() => setShowTextOverlayPanel(false)}
          onSuccess={handleTextOverlaySuccess}
        />
      )}
    </>
  );
}
