import { type AssetScope, formatEnumLabel } from '@genfeedai/contracts';
import type {
  ICredential,
  IImage,
  IIngredient,
} from '@genfeedai/contracts/interfaces';
import IngredientDetailImage from '@ui/ingredients/detail-image/IngredientDetailImage';
import IngredientDetailVideo from '@ui/ingredients/detail-video/IngredientDetailVideo';
import type { RefObject } from 'react';

type Props = {
  localIngredient: IIngredient;
  isVideo: boolean;
  isImage: boolean;
  metadataLabel: string | undefined;
  videoRef: RefObject<HTMLVideoElement | null>;
  credentials: ICredential[] | undefined;
  childIngredients: IIngredient[];
  // Loading states
  isPublishing: boolean;
  isDownloading: boolean;
  isUpscaling: boolean;
  isCloning: boolean;
  isVoting: boolean;
  isReversing: boolean;
  isMirroring: boolean;
  isPortraiting: boolean;
  isConverting: boolean;
  isConvertingToVideo: boolean;
  isGeneratingCaptions: boolean;
  isAddingTextOverlay: boolean;
  isUpdating: boolean;
  // Handlers
  onReload: (skipNotification?: boolean) => Promise<void>;
  onShareVideo: () => void;
  onPublishVideo: (ingredient: IIngredient) => void;
  onDownloadVideo: (video: IIngredient) => Promise<undefined>;
  onUpdateMetadata: (field: string, value: string) => Promise<unknown>;
  onUpdateSharing: (field: string, value: boolean | string) => Promise<unknown>;
  onUsePrompt: (ingredient: IIngredient) => void;
  onCreateVariation: (image: IIngredient) => void;
  onDownloadImage: (image: IIngredient) => Promise<undefined>;
  onPublishImage: (ingredient: IIngredient) => void;
  onShareImage: () => void;
  onScopeChange: (
    scope: AssetScope,
    updatedIngredient?: IIngredient,
  ) => Promise<void>;
};

export default function IngredientOverlayMediaContent({
  localIngredient,
  isVideo,
  isImage,
  metadataLabel,
  videoRef,
  credentials,
  childIngredients,
  isPublishing,
  isDownloading,
  isUpscaling,
  isCloning,
  isVoting,
  isReversing,
  isMirroring,
  isPortraiting,
  isConverting,
  isConvertingToVideo,
  isGeneratingCaptions,
  isAddingTextOverlay,
  isUpdating,
  onReload,
  onShareVideo,
  onPublishVideo,
  onDownloadVideo,
  onUpdateMetadata,
  onUpdateSharing,
  onUsePrompt,
  onCreateVariation,
  onDownloadImage,
  onPublishImage,
  onShareImage,
  onScopeChange,
}: Props) {
  return (
    <div className="rounded-3xl bg-secondary shadow-border p-4 md:p-6">
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        {isVideo ? (
          <IngredientDetailVideo
            video={localIngredient}
            videoRef={videoRef}
            credentials={credentials}
            childIngredients={childIngredients}
            onReload={onReload}
            onShareVideo={onShareVideo}
            onPublishVideo={onPublishVideo}
            onDownloadVideo={onDownloadVideo}
            onUpdateMetadata={onUpdateMetadata}
            onUpdateSharing={onUpdateSharing}
            isPublishing={isPublishing}
            isDownloading={isDownloading}
            isUpscaling={isUpscaling}
            isCloning={isCloning}
            isVoting={isVoting}
            isReversing={isReversing}
            isMirroring={isMirroring}
            isPortraiting={isPortraiting}
            isConverting={isConverting}
            isGeneratingCaptions={isGeneratingCaptions}
            isAddingTextOverlay={isAddingTextOverlay}
            onUsePrompt={onUsePrompt}
          />
        ) : isImage ? (
          <IngredientDetailImage
            childIngredients={childIngredients}
            image={localIngredient as unknown as IImage}
            isCloning={isCloning}
            isConvertingToVideo={isConvertingToVideo}
            isDownloading={isDownloading}
            isPublishing={isPublishing}
            isUpdating={isUpdating}
            isUpscaling={isUpscaling}
            isVoting={isVoting}
            onCreateVariation={onCreateVariation}
            onDownloadImage={onDownloadImage}
            onPublishImage={onPublishImage}
            onShareImage={onShareImage}
            onUpdateMetadata={onUpdateMetadata}
            onUpdateSharing={onUpdateSharing}
            onScopeChange={onScopeChange}
            onUsePrompt={onUsePrompt}
          />
        ) : (
          <div className="col-span-full text-center">
            <p className="text-lg mb-2">{metadataLabel}</p>

            <p className="text-sm text-foreground/60">
              {formatEnumLabel(localIngredient.category)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
