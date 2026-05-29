'use client';

import { ModalEnum } from '@genfeedai/enums';
import type { IngredientOverlayProps } from '@genfeedai/props/modals/modal.props';
import TextOverlayPanel from '@ui/ingredients/text-overlay-panel/TextOverlayPanel';
import Loading from '@ui/loading/default/Loading';
import EntityOverlayShell from '@ui/overlays/entity/EntityOverlayShell';
import IngredientOverlayAlerts from './IngredientOverlayAlerts';
import IngredientOverlayBadges from './IngredientOverlayBadges';
import IngredientOverlayMediaContent from './IngredientOverlayMediaContent';
import { useModalIngredient } from './useModalIngredient';

export default function IngredientOverlay({
  ingredient,
  onConfirm,
  isOpen,
  openKey,
  onClose,
}: IngredientOverlayProps) {
  const {
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
  } = useModalIngredient({ ingredient, onConfirm, isOpen, openKey, onClose });

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
            <IngredientOverlayBadges ingredient={localIngredient} />
          ) : null
        }
      >
        {!localIngredient ? (
          <Loading isFullSize={false} />
        ) : (
          <div className="mx-auto flex h-auto max-w-[1520px] flex-col gap-4 p-4 md:p-6">
            <IngredientOverlayAlerts
              error={error}
              localIngredient={localIngredient}
              viewingChild={viewingChild}
              onBackToParent={handleBackToParent}
            />

            <IngredientOverlayMediaContent
              localIngredient={localIngredient}
              isVideo={isVideo}
              isImage={isImage}
              metadataLabel={metadataLabel}
              videoRef={videoRef}
              credentials={credentials}
              childIngredients={childIngredients}
              isPublishing={loadingStates.isPublishing}
              isDownloading={loadingStates.isDownloading}
              isUpscaling={loadingStates.isUpscaling}
              isCloning={loadingStates.isCloning}
              isVoting={loadingStates.isVoting}
              isReversing={loadingStates.isReversing}
              isMirroring={loadingStates.isMirroring}
              isPortraiting={loadingStates.isPortraiting}
              isConverting={loadingStates.isConverting}
              isConvertingToVideo={loadingStates.isConvertingToVideo}
              isGeneratingCaptions={loadingStates.isGeneratingCaptions}
              isAddingTextOverlay={loadingStates.isAddingTextOverlay}
              isUpdating={isUpdating}
              onReload={handleReload}
              onShareVideo={() => handlers.handleShare(localIngredient!)}
              onPublishVideo={handlers.handlePublish}
              onDownloadVideo={async (video) => {
                await handlers.handleDownload(video);
                return undefined;
              }}
              onUpdateMetadata={(field: string, value: string) =>
                handlers.handleUpdateMetadata(localIngredient!, field, value)
              }
              onUpdateSharing={(field: string, value: boolean | string) =>
                handlers.handleUpdateSharing(localIngredient!, field, value)
              }
              onUsePrompt={handleUsePrompt}
              onCreateVariation={handleCreateVariation}
              onDownloadImage={async (image) => {
                await handlers.handleDownload(image);
                return undefined;
              }}
              onPublishImage={handlers.handlePublish}
              onShareImage={() => handlers.handleShare(localIngredient!)}
              onScopeChange={handleScopeChange}
            />
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
