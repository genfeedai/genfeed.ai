'use client';

import { useIngredientsContext } from '@contexts/content/ingredients-context/ingredients-context';
import { useIngredientsHeaderContext } from '@contexts/content/ingredients-header-context/ingredients-header-context';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import type { PromptTextareaSchema } from '@genfeedai/client/schemas';
import {
  AlertCategory,
  ButtonVariant,
  IngredientCategory,
  ModalEnum,
} from '@genfeedai/enums';
import type { IIngredient } from '@genfeedai/interfaces';
import { useIngredientsList } from '@hooks/data/ingredients/use-ingredients-list/use-ingredients-list';
import type { IngredientsListProps } from '@props/pages/ingredients-list.props';
import { usePostModal } from '@providers/global-modals/global-modals.provider';
import Button from '@ui/buttons/base/Button';
import Alert from '@ui/feedback/alert/Alert';
import IngredientsListContent from '@ui/ingredients/list/content/IngredientsListContent';
import IngredientsListFooter from '@ui/ingredients/list/footer/IngredientsListFooter';
import IngredientsListHeader from '@ui/ingredients/list/header/IngredientsListHeader';
import IngredientsListSidebar from '@ui/ingredients/list/sidebar/IngredientsListSidebar';
import { LazyModalImageToVideo } from '@ui/lazy/modal/LazyModal';
import { PageScope } from '@ui-constants/misc.constant';
import { format } from 'date-fns';
import { useEffect, useMemo } from 'react';

export default function IngredientsList({
  type: typeProp,
  scope = PageScope.BRAND,
}: IngredientsListProps) {
  const { ingredientType } = useIngredientsContext();
  const { setHeaderMeta } = useIngredientsHeaderContext();
  const { selectedBrand } = useBrand();
  const type = ingredientType || typeProp;

  const {
    singularType,
    formatFilter,
    isLoading,
    isUsingCache,
    cachedAt,
    isLoadingFolders,
    isMerging,
    filteredIngredients,
    mediaIngredients,
    hasFilteredEmptyState,
    folders,
    selectedFolderId,
    selectedFolderForModal,
    selectedIngredientIds,
    setSelectedIngredientIds,
    isActionsEnabled,
    isDragEnabled,
    isPortraiting,
    isGeneratingCaptions,
    isMirroring,
    isReversing,
    lightboxOpen,
    lightboxIndex,
    brandId,
    handleRefresh,
    clearFilters,
    handleScopeChange,
    handleDeleteIngredient,
    handleArchiveIngredient,
    handleConvertToPortrait,
    handleGenerateCaptions,
    handleReverse,
    handleMirror,
    handleSeeDetails,
    handleUpdateParent,
    handleCopyPrompt,
    handleReprompt,
    handleSelectFolder,
    handleFolderDrop,
    handleCreateFolder,
    handleFolderModalConfirm,
    handleMerge,
    handleClearSelection,
    handleBulkDelete,
    openIngredientModal,
    openLightboxForIngredient,
    closeLightbox,
    setIngredients,
    handleConvertToVideo,
    imageToVideoTarget,
    imageToVideoPromptData,
    isImageToVideoGenerating,
    handleImageToVideoPromptChange,
    handleImageToVideoSubmit,
    handleCloseImageToVideoModal,
    videoModels,
    presets,
    moods,
    styles,
    cameras,
    sounds,
    tags,
    fontFamilies,
    blacklists,
  } = useIngredientsList({ scope, type });
  const { openPostBatchModal } = usePostModal({
    onRefresh: () => {
      void handleRefresh(true);
    },
  });

  const canMerge =
    singularType === IngredientCategory.VIDEO ||
    singularType === IngredientCategory.IMAGE;
  const selectedIngredients = useMemo(
    () =>
      filteredIngredients.filter((ingredient) =>
        selectedIngredientIds.includes(ingredient.id),
      ),
    [filteredIngredients, selectedIngredientIds],
  );
  const selectedCampaign = selectedIngredients[0]?.campaign;
  const canPublishCampaign =
    Boolean(selectedBrand?.isDarkroomEnabled) &&
    selectedIngredients.length >= 2 &&
    selectedIngredients.every(
      (ingredient) =>
        ingredient.category === IngredientCategory.IMAGE &&
        ingredient.reviewStatus === 'approved' &&
        ingredient.campaign &&
        ingredient.campaign === selectedCampaign,
    );

  const cachedLabel = useMemo(() => {
    if (!cachedAt) {
      return '';
    }
    return format(new Date(cachedAt), 'PPpp');
  }, [cachedAt]);

  useEffect(() => {
    const itemLabel =
      filteredIngredients.length === 1 ? type.slice(0, -1) : type;
    setHeaderMeta(`${filteredIngredients.length} ${itemLabel}`);

    return () => {
      setHeaderMeta(undefined);
    };
  }, [filteredIngredients.length, setHeaderMeta, type]);

  return (
    <>
      <IngredientsListHeader
        selectedCount={selectedIngredientIds.length}
        canMerge={canMerge}
        canPublishCampaign={canPublishCampaign}
        isMerging={isMerging}
        onClearSelection={handleClearSelection}
        onBulkDelete={handleBulkDelete}
        onMerge={handleMerge}
        onPublishCampaign={() => {
          if (canPublishCampaign) {
            openPostBatchModal(selectedIngredients);
          }
        }}
      />

      {isUsingCache && (
        <Alert type={AlertCategory.WARNING}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="font-medium">
                Live ingredients are unavailable.
              </div>
              <div className="text-xs text-foreground/70">
                Showing cached ingredients
                {cachedLabel ? ` from ${cachedLabel}` : ''}.
              </div>
            </div>
            <Button
              label="Retry"
              variant={ButtonVariant.OUTLINE}
              onClick={() => {
                handleRefresh(true);
              }}
            />
          </div>
        </Alert>
      )}
      <div className="grid gap-6 xl:grid-cols-[minmax(13rem,14rem)_minmax(0,1fr)]">
        <IngredientsListSidebar
          scope={scope}
          folders={folders}
          selectedFolderId={selectedFolderId}
          isLoading={isLoadingFolders}
          onSelectFolder={handleSelectFolder}
          onDropIngredient={handleFolderDrop}
          onCreateFolder={handleCreateFolder}
        />

        <div className="min-w-0">
          <IngredientsListContent
            type={type}
            scope={scope}
            singularType={singularType}
            formatFilter={formatFilter}
            isLoading={isLoading}
            filteredIngredients={filteredIngredients}
            hasFilteredEmptyState={hasFilteredEmptyState}
            selectedIngredientIds={selectedIngredientIds}
            isActionsEnabled={isActionsEnabled}
            isDragEnabled={isDragEnabled}
            isPortraiting={isPortraiting}
            isGeneratingCaptions={isGeneratingCaptions}
            isMirroring={isMirroring}
            isReversing={isReversing}
            onSelectionChange={setSelectedIngredientIds}
            onDeleteIngredient={handleDeleteIngredient}
            onArchiveIngredient={handleArchiveIngredient}
            onConvertToPortrait={handleConvertToPortrait}
            onGenerateCaptions={handleGenerateCaptions}
            onReverse={handleReverse}
            onMirror={handleMirror}
            onSeeDetails={handleSeeDetails}
            onUpdateParent={handleUpdateParent}
            onRefresh={() => {
              handleRefresh(true);
            }}
            onPublishIngredient={(ingredient: IIngredient) =>
              openIngredientModal(ModalEnum.POST, ingredient)
            }
            onOpenIngredientModal={openIngredientModal}
            onOpenLightbox={openLightboxForIngredient}
            onClearFilters={clearFilters}
            onSetIngredients={setIngredients}
            onScopeChange={handleScopeChange}
            onCopyPrompt={handleCopyPrompt}
            onReprompt={handleReprompt}
            // onConvertToVideo={handleConvertToVideo} // used in the ingredients list page. not set up right now.
          />
        </div>
      </div>

      <IngredientsListFooter
        scope={scope}
        brandId={brandId}
        mediaIngredients={mediaIngredients}
        lightboxOpen={lightboxOpen}
        lightboxIndex={lightboxIndex}
        onCloseLightbox={closeLightbox}
        selectedFolderForModal={selectedFolderForModal}
        onFolderModalConfirm={handleFolderModalConfirm}
      />

      {handleConvertToVideo &&
        imageToVideoTarget !== undefined &&
        handleImageToVideoPromptChange &&
        handleImageToVideoSubmit && (
          <LazyModalImageToVideo
            image={imageToVideoTarget ?? null}
            models={videoModels || []}
            presets={presets || []}
            moods={moods}
            styles={styles}
            cameras={cameras}
            sounds={sounds}
            tags={tags}
            fontFamilies={fontFamilies}
            blacklists={blacklists}
            promptData={imageToVideoPromptData || { isValid: false, text: '' }}
            isGenerating={isImageToVideoGenerating || false}
            onPromptChange={
              handleImageToVideoPromptChange as (
                data: Partial<PromptTextareaSchema> & { isValid: boolean },
              ) => void
            }
            onSubmit={
              handleImageToVideoSubmit as (
                data: PromptTextareaSchema & { isValid: boolean },
              ) => void
            }
            onClose={handleCloseImageToVideoModal}
          />
        )}
    </>
  );
}
