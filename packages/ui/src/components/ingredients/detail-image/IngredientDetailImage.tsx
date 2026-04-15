'use client';

import type { IEvaluation } from '@genfeedai/client/models';
import { IngredientCategory, IngredientStatus } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { useEvaluation } from '@genfeedai/hooks/ui/evaluation/use-evaluation/use-evaluation';
import { useIngredientMetadata } from '@genfeedai/hooks/ui/ingredient/use-ingredient-metadata/use-ingredient-metadata';
import { useIngredientSharing } from '@genfeedai/hooks/ui/ingredient/use-ingredient-sharing/use-ingredient-sharing';
import type { IImage, IMetadata, ITag } from '@genfeedai/interfaces';
import type { IngredientDetailImageProps } from '@genfeedai/props/content/ingredient.props';
import type { TabItem } from '@genfeedai/props/ui/navigation/tabs.props';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { ImagesService } from '@genfeedai/services/ingredients/images.service';
import EvaluationCard from '@ui/evaluation/card/EvaluationCard';
import IngredientWorkspacePanel from '@ui/ingredients/detail/shared/IngredientWorkspacePanel';
import IngredientTabsChildren from '@ui/ingredients/tabs/children/IngredientTabsChildren';
import IngredientTabsInfo from '@ui/ingredients/tabs/info/IngredientTabsInfo';
import IngredientTabsMetadata from '@ui/ingredients/tabs/metadata/IngredientTabsMetadata';
import IngredientTabsPosts from '@ui/ingredients/tabs/posts/IngredientTabsPosts';
import IngredientTabsPrompts from '@ui/ingredients/tabs/prompts/IngredientTabsPrompts';
import IngredientTabsSharing from '@ui/ingredients/tabs/sharing/IngredientTabsSharing';
import IngredientTabsTags from '@ui/ingredients/tabs/tags/IngredientTabsTags';
import LoadingOverlay from '@ui/loading/overlay/LoadingOverlay';
import IngredientQuickActions from '@ui/quick-actions/actions/IngredientQuickActions';
import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';

type ImageDetailTab =
  | 'info'
  | 'posts'
  | 'metadata'
  | 'prompts'
  | 'children'
  | 'tags'
  | 'sharing'
  | 'evaluation';

export default function IngredientDetailImage({
  image,
  // childIngredients,
  // onVoteIngredient,
  // onEditImage,
  onUpscaleImage,
  // onPublishImage,
  onCloneImage,
  onConvertToVideo,
  onUseAsVideoReference,
  onCreateVariation,
  onShareImage,
  onDownloadImage,
  onCopyPrompt,
  onReprompt,
  onUsePrompt,
  onSeeDetails,
  onScopeChange,
  isUpscaling = false,
  isPublishing = false,
  isCloning = false,
  isConvertingToVideo = false,
  isDownloading = false,
  isVoting = false,
  isUpdating: propIsUpdating = false,
}: IngredientDetailImageProps) {
  const [tab, setTab] = useState<ImageDetailTab>('info');

  const [currentImage, setCurrentImage] = useState<IImage>(image);

  // Hook for AI quality evaluation (autoFetch disabled - evaluation comes with image)
  const {
    evaluation: newEvaluation,
    isEvaluating,
    evaluate,
  } = useEvaluation({
    autoFetch: false,
    contentId: image.id,
    contentType: IngredientCategory.IMAGE,
  });

  // Use evaluation from image (fetched with image) or newly created evaluation from hook
  // Cast to client model type for compatibility with EvaluationCard
  const evaluation: IEvaluation | undefined =
    newEvaluation ?? ((image as IImage).evaluation as IEvaluation | undefined);

  const getImagesService = useAuthedService((token: string) =>
    ImagesService.getInstance(token),
  );

  const handleRefreshMetadata = useCallback(async () => {
    try {
      const service = await getImagesService();
      const refreshed = await service.findOne(currentImage.id);

      setCurrentImage(refreshed);
      return refreshed;
    } catch (error) {
      logger.error('Failed to reload image after metadata refresh', error);
      throw error;
    }
  }, [currentImage.id, getImagesService]);

  const { updateMetadata: updateMetadataHook, isUpdating: isUpdatingMetadata } =
    useIngredientMetadata(
      currentImage,
      (updated) => {
        setCurrentImage(updated);
      },
      handleRefreshMetadata,
    );

  const { updateSharing: updateSharingHook, isUpdating: isUpdatingSharing } =
    useIngredientSharing(currentImage, (updated) => {
      setCurrentImage(updated);
    });

  const isUpdating = propIsUpdating || isUpdatingMetadata || isUpdatingSharing;

  useEffect(() => {
    setCurrentImage(image);
  }, [image]);

  const metadata = currentImage?.metadata as IMetadata;
  const metadataLabel = metadata?.label;

  const imageWidth = metadata?.width || 1920;
  const imageHeight = metadata?.height || 1920;
  const isPortrait = imageHeight > imageWidth;

  const tabs: TabItem[] = [
    {
      id: 'info',
      label: 'info',
    },
    {
      id: 'evaluation',
      label: 'quality',
    },
    {
      id: 'sharing',
      label: 'sharing',
    },
    {
      id: 'posts',
      label: 'posts',
    },
    {
      id: 'metadata',
      label: 'metadata',
    },
    {
      id: 'prompts',
      label: 'prompts',
    },
  ];

  return (
    <>
      <div className="space-y-4">
        <div
          className={cn(
            'relative overflow-hidden shadow-lg group opacity-80 hover:opacity-100',
            'transition-opacity duration-300 max-h-[70vh] mx-auto flex items-center justify-center w-fit',
            isPortrait ? 'max-w-2xl' : 'max-w-4xl',
          )}
        >
          <Image
            className={cn(
              'transition-transform duration-300 group-hover:scale-105',
              'group-hover:-rotate-1 w-auto h-auto max-h-[70vh]',
            )}
            alt={metadataLabel || 'Image'}
            width={metadata?.width || 1920}
            height={metadata?.height || 1920}
            sizes="(max-width: 768px) 100vw, 50vw"
            priority={true}
            src={
              currentImage.ingredientUrl ||
              `${EnvironmentService.assetsEndpoint}/placeholders/portrait.jpg`
            }
            style={{
              height: 'auto',
              maxWidth: '100%',
              objectFit: 'contain',
            }}
          />

          {currentImage.status === IngredientStatus.PROCESSING && (
            <LoadingOverlay message="Processing image..." />
          )}
        </div>

        <IngredientQuickActions
          selectedIngredient={currentImage}
          onShare={onShareImage}
          onDownload={onDownloadImage}
          onUpscale={onUpscaleImage}
          onClone={onCloneImage}
          onConvertToVideo={onConvertToVideo}
          onUseAsVideoReference={onUseAsVideoReference}
          onCreateVariation={onCreateVariation}
          onCopy={onCopyPrompt}
          onReprompt={onReprompt}
          onUsePrompt={onUsePrompt}
          onSeeDetails={onSeeDetails}
          onScopeChange={async (scope, updatedItem) => {
            if (updatedItem) {
              setCurrentImage(updatedItem);
            }
            // Call parent handler if provided
            onScopeChange?.(scope, updatedItem);
          }}
          isPublishing={isPublishing}
          isUpscaling={isUpscaling}
          isCloning={isCloning}
          isVoting={isVoting}
          isDownloading={isDownloading}
          isConvertingToVideo={isConvertingToVideo}
        />
      </div>

      <div className="col-span-2 space-y-4">
        <IngredientWorkspacePanel
          title="Refine image details"
          tabs={tabs}
          activeTab={tab}
          onTabChange={(nextTab) => setTab(nextTab as ImageDetailTab)}
        >
          {tab === 'info' && (
            <IngredientTabsInfo
              ingredient={currentImage}
              onUpdate={(data) =>
                setCurrentImage((previousImage) => ({
                  ...previousImage,
                  ...data,
                }))
              }
              isUpdating={isUpdating}
              onUpdateMetadata={updateMetadataHook}
            />
          )}

          {tab === 'evaluation' && (
            <EvaluationCard
              contentId={currentImage.id}
              contentType={IngredientCategory.IMAGE}
              evaluation={evaluation}
              onEvaluate={async () => {
                await evaluate();
              }}
              isEvaluating={isEvaluating}
            />
          )}

          {tab === 'posts' && <IngredientTabsPosts ingredient={currentImage} />}

          {tab === 'metadata' && (
            <IngredientTabsMetadata
              ingredient={currentImage}
              onRefresh={async () => {
                await handleRefreshMetadata();
              }}
            />
          )}

          {tab === 'prompts' && (
            <IngredientTabsPrompts ingredient={currentImage} />
          )}

          {tab === 'children' && (
            <IngredientTabsChildren
              ingredient={currentImage}
              onViewChild={(child) => {
                logger.info('View child', { childId: child.id });
              }}
            />
          )}

          {tab === 'tags' && (
            <IngredientTabsTags
              ingredient={currentImage}
              onTagsUpdate={async (tags: ITag[]) => {
                logger.info('Tags updated', { tags });
                try {
                  await updateMetadataHook('label', metadataLabel);
                } catch (error) {
                  logger.error('Failed to persist ingredient tag metadata', {
                    error,
                    ingredientId: currentImage.id,
                  });
                }
              }}
            />
          )}

          {tab === 'sharing' && (
            <IngredientTabsSharing
              ingredient={currentImage}
              onUpdateSharing={updateSharingHook}
              isUpdating={isUpdating}
            />
          )}
        </IngredientWorkspacePanel>
      </div>
    </>
  );
}
