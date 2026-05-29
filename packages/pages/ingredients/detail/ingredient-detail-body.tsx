'use client';

import { IngredientCategory } from '@genfeedai/enums';
import type { ICredential, IIngredient } from '@genfeedai/interfaces';
import type {
  IngredientDetailImageProps,
  IngredientDetailVideoProps,
} from '@props/content/ingredient.props';
import { EnvironmentService } from '@services/core/environment.service';
import IngredientDetailImage from '@ui/ingredients/detail-image/IngredientDetailImage';
import IngredientDetailVideo from '@ui/ingredients/detail-video/IngredientDetailVideo';
import { LazyModalTrim } from '@ui/lazy/modal/LazyModal';

type Props = {
  ingredient: IIngredient;
  childIngredients: IIngredient[];
  credentials: ICredential[] | undefined;
  isTrimModalOpen: boolean;
  isUpdating: boolean;
  handlers: {
    handlePublish: (ingredient: IIngredient, platform: string) => void;
    handleDownload: (ingredient: IIngredient) => Promise<void>;
    handleReverse: (ingredient: IIngredient) => void;
    handleMirror: (ingredient: IIngredient) => void;
    handleConvertToGif: (ingredient: IIngredient) => void;
    handleGenerateCaptions: (ingredient: IIngredient) => void;
    handleAddTextOverlay: (ingredient: IIngredient) => void;
    handleCopyPrompt: (ingredient: IIngredient) => void;
    handleReprompt: (ingredient: IIngredient) => void;
    handleConvertToVideo: (ingredient: IIngredient) => void;
    handleUseAsVideoReference: (ingredient: IIngredient) => void;
  };
  loadingStates: {
    isPublishing: boolean;
    isDownloading: boolean;
    isUpscaling: boolean;
    isCloning: boolean;
    isReversing: boolean;
    isMirroring: boolean;
    isPortraiting: boolean;
    isConverting: boolean;
    isGeneratingCaptions: boolean;
    isAddingTextOverlay: boolean;
    isConvertingToVideo: boolean;
  };
  onShareVideo: () => void;
  onTrimVideo: () => void;
  onUpdateSharing: (field: string, value: boolean | string) => Promise<void>;
  onUpdateMetadata: (field: string, value: string) => Promise<void>;
  onTrimConfirm: (startTime: number, endTime: number) => Promise<void>;
  onTrimClose: () => void;
};

export default function IngredientDetailBody({
  ingredient,
  childIngredients,
  credentials,
  isTrimModalOpen,
  isUpdating,
  handlers,
  loadingStates,
  onShareVideo,
  onTrimVideo,
  onUpdateSharing,
  onUpdateMetadata,
  onTrimConfirm,
  onTrimClose,
}: Props) {
  return (
    <>
      <div className="grid grid-cols-3 gap-6 h-full p-6">
        {ingredient.category === IngredientCategory.VIDEO ? (
          <IngredientDetailVideo
            video={ingredient}
            childIngredients={childIngredients}
            credentials={credentials}
            onShareVideo={
              onShareVideo as IngredientDetailVideoProps['onShareVideo']
            }
            onTrimVideo={
              onTrimVideo as IngredientDetailVideoProps['onTrimVideo']
            }
            onPublishVideo={
              handlers.handlePublish as IngredientDetailVideoProps['onPublishVideo']
            }
            onDownloadVideo={
              handlers.handleDownload as IngredientDetailVideoProps['onDownloadVideo']
            }
            // onUpscaleVideo={handlers.handleUpscale}
            // onCloneVideo={handlers.handleClone}
            onReverseVideo={handlers.handleReverse}
            onMirrorVideo={handlers.handleMirror}
            // onPortraitVideo={handlers.handlePortrait}
            onConvertToGif={handlers.handleConvertToGif}
            onGenerateCaptions={handlers.handleGenerateCaptions}
            onAddTextOverlay={handlers.handleAddTextOverlay}
            onCopyPrompt={handlers.handleCopyPrompt}
            onReprompt={handlers.handleReprompt}
            // onSeeDetails={handlers.handleSeeDetails}
            onUpdateSharing={onUpdateSharing}
            onUpdateMetadata={onUpdateMetadata}
            isPublishing={loadingStates.isPublishing}
            isDownloading={loadingStates.isDownloading}
            isUpscaling={loadingStates.isUpscaling}
            isCloning={loadingStates.isCloning}
            isReversing={loadingStates.isReversing}
            isMirroring={loadingStates.isMirroring}
            isPortraiting={loadingStates.isPortraiting}
            isConverting={loadingStates.isConverting}
            isGeneratingCaptions={loadingStates.isGeneratingCaptions}
            isAddingTextOverlay={loadingStates.isAddingTextOverlay}
            isUpdating={isUpdating}
          />
        ) : (
          <IngredientDetailImage
            image={ingredient}
            childIngredients={childIngredients}
            onShareImage={
              onShareVideo as IngredientDetailImageProps['onShareImage']
            }
            onPublishImage={
              handlers.handlePublish as IngredientDetailImageProps['onPublishImage']
            }
            onDownloadImage={
              handlers.handleDownload as IngredientDetailImageProps['onDownloadImage']
            }
            // onUpscaleImage={handlers.handleUpscale}
            // onCloneImage={handlers.handleClone}
            onConvertToVideo={handlers.handleConvertToVideo}
            onUseAsVideoReference={handlers.handleUseAsVideoReference}
            onCopyPrompt={handlers.handleCopyPrompt}
            onReprompt={handlers.handleReprompt}
            // onSeeDetails={handlers.handleSeeDetails}
            onUpdateSharing={onUpdateSharing}
            onUpdateMetadata={onUpdateMetadata}
            isPublishing={loadingStates.isPublishing}
            isDownloading={loadingStates.isDownloading}
            isUpscaling={loadingStates.isUpscaling}
            isCloning={loadingStates.isCloning}
            isConvertingToVideo={loadingStates.isConvertingToVideo}
            isUpdating={isUpdating}
          />
        )}
      </div>

      {isTrimModalOpen && ingredient.category === IngredientCategory.VIDEO && (
        <LazyModalTrim
          videoUrl={`${EnvironmentService.ingredientsEndpoint}/ingredients/${ingredient.id}`}
          videoId={ingredient.id}
          videoDuration={
            typeof ingredient.metadata === 'object'
              ? ingredient.metadata?.duration || 10
              : 10
          }
          onConfirm={onTrimConfirm}
          onClose={onTrimClose}
        />
      )}
    </>
  );
}
