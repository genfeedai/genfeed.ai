'use client';

import { useIngredientsContext } from '@contexts/content/ingredients-context/ingredients-context';
import { useIngredientsHeaderContext } from '@contexts/content/ingredients-header-context/ingredients-header-context';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  AlertCategory,
  ButtonVariant,
  FleetReviewStatus,
  IngredientCategory,
  ModalEnum,
  PageScope,
} from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { downloadIngredient } from '@helpers/media/download/download.helper';
import { useIngredientDeepLink } from '@hooks/data/ingredients/use-ingredient-deep-link/use-ingredient-deep-link';
import { useIngredientsList } from '@hooks/data/ingredients/use-ingredients-list/use-ingredients-list';
import type { IngredientsListProps } from '@props/pages/ingredients-list.props';
import { usePostModal } from '@providers/global-modals/global-modals.provider';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Alert from '@ui/feedback/alert/Alert';
import IngredientsListContent from '@ui/ingredients/list/content/IngredientsListContent';
import IngredientsListFooter from '@ui/ingredients/list/footer/IngredientsListFooter';
import IngredientsListHeader from '@ui/ingredients/list/header/IngredientsListHeader';
import IngredientsListSidebar from '@ui/ingredients/list/sidebar/IngredientsListSidebar';
import { LazyModalImageToVideo } from '@ui/lazy/modal/LazyModal';
import { Button } from '@ui/primitives/button';
import { format } from 'date-fns';
import { useCallback, useEffect, useMemo } from 'react';

/**
 * Categories the merge action actually supports. Kept local to this file
 * rather than a shared constant because the merge endpoint
 * (`use-ingredients-actions.ts`) is video/image-specific by design — this is
 * not a general "which categories exist" list.
 */
const MERGEABLE_CATEGORIES: readonly IngredientCategory[] = [
  IngredientCategory.VIDEO,
  IngredientCategory.IMAGE,
];

/**
 * `type` is the plural URL/filter token (e.g. "images", "ingredients"). Most
 * types pluralize/singularize by trailing "s", but the all-types view uses
 * the generic "ingredients" token while the product language for that view is
 * "assets".
 */
const TYPE_LABEL_OVERRIDES: Readonly<
  Record<string, { singular: string; plural: string }>
> = {
  ingredients: { plural: 'assets', singular: 'asset' },
};

function getItemLabel(type: string, count: number): string {
  const override = TYPE_LABEL_OVERRIDES[type];
  if (override) {
    return count === 1 ? override.singular : override.plural;
  }
  return count === 1 ? type.slice(0, -1) : type;
}

export default function IngredientsList({
  folderNavigation = 'content',
  type: typeProp,
  scope = PageScope.BRAND,
}: IngredientsListProps) {
  const { ingredientType, viewMode } = useIngredientsContext();
  const { setHeaderMeta } = useIngredientsHeaderContext();
  const { selectedBrand } = useBrand();
  const type = ingredientType || typeProp;

  const {
    singularType,
    formatFilter,
    isLoading,
    isUsingCache,
    cachedAt,
    loadError,
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
  } = useIngredientsList({ folderNavigation, scope, type });
  const { openPostBatchModal } = usePostModal({
    onRefresh: () => {
      void handleRefresh(true);
    },
  });

  const selectedIngredients = useMemo(
    () =>
      filteredIngredients.filter((ingredient) =>
        selectedIngredientIds.includes(ingredient.id),
      ),
    [filteredIngredients, selectedIngredientIds],
  );
  // Mergeable only when every selected asset is the same mergeable category —
  // the merge endpoint is video/image-specific, not a generic bulk action.
  const firstSelectedCategory = selectedIngredients[0]?.category;
  const canMerge =
    selectedIngredients.length >= 2 &&
    Boolean(
      firstSelectedCategory &&
        MERGEABLE_CATEGORIES.includes(firstSelectedCategory),
    ) &&
    selectedIngredients.every(
      (ingredient) => ingredient.category === firstSelectedCategory,
    );
  const selectedCampaign = selectedIngredients[0]?.campaign;
  const canPublishCampaign =
    Boolean(selectedBrand?.isFleetEnabled) &&
    selectedIngredients.length >= 2 &&
    selectedIngredients.every(
      (ingredient) =>
        ingredient.category === IngredientCategory.IMAGE &&
        ingredient.reviewStatus === FleetReviewStatus.APPROVED &&
        ingredient.campaign &&
        ingredient.campaign === selectedCampaign,
    );

  const handleBulkDownload = useCallback(async () => {
    const results = await Promise.allSettled(
      selectedIngredients.map((ingredient) => downloadIngredient(ingredient)),
    );
    const failures = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );

    for (const failure of failures) {
      logger.error('Failed to download ingredient', failure.reason);
    }

    if (failures.length === 0) {
      NotificationsService.getInstance().success('Download started');
      return;
    }

    NotificationsService.getInstance().error(
      failures.length === selectedIngredients.length
        ? 'Download'
        : `Download for ${failures.length} of ${selectedIngredients.length} assets`,
    );
  }, [selectedIngredients]);

  const cachedLabel = useMemo(() => {
    if (!cachedAt) {
      return '';
    }
    return format(new Date(cachedAt), 'PPpp');
  }, [cachedAt]);

  const handleOpenDeepLinkedIngredient = useCallback(
    (ingredient: IIngredient) => {
      openIngredientModal(ModalEnum.INGREDIENT, ingredient);
    },
    [openIngredientModal],
  );

  useIngredientDeepLink({
    ingredients: filteredIngredients,
    isLoading,
    onOpen: handleOpenDeepLinkedIngredient,
  });

  useEffect(() => {
    const itemLabel = getItemLabel(type, filteredIngredients.length);
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
        onDownload={handleBulkDownload}
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
              variant={ButtonVariant.SECONDARY}
              onClick={() => {
                handleRefresh(true);
              }}
            />
          </div>
        </Alert>
      )}
      {loadError && !isUsingCache ? (
        <Alert type={AlertCategory.ERROR}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="font-medium">{loadError}</div>
              <div className="text-xs text-foreground/70">
                Retry to load the latest Library assets.
              </div>
            </div>
            <Button
              label="Retry"
              variant={ButtonVariant.SECONDARY}
              onClick={() => {
                void handleRefresh(true);
              }}
            />
          </div>
        </Alert>
      ) : null}
      {!loadError || isUsingCache ? (
        <div
          className={
            folderNavigation === 'content'
              ? 'grid gap-6 xl:grid-cols-[minmax(13rem,14rem)_minmax(0,1fr)]'
              : 'min-w-0'
          }
        >
          {folderNavigation === 'content' ? (
            <IngredientsListSidebar
              scope={scope}
              folders={folders}
              selectedFolderId={selectedFolderId}
              isLoading={isLoadingFolders}
              onSelectFolder={handleSelectFolder}
              onDropIngredient={handleFolderDrop}
              onCreateFolder={handleCreateFolder}
            />
          ) : null}

          <div className="min-w-0">
            <IngredientsListContent
              type={type}
              scope={scope}
              singularType={singularType}
              viewMode={viewMode}
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
            />
          </div>
        </div>
      ) : null}

      <IngredientsListFooter
        scope={scope}
        brandId={brandId}
        mediaIngredients={mediaIngredients}
        lightboxOpen={lightboxOpen}
        lightboxIndex={lightboxIndex}
        onCloseLightbox={closeLightbox}
        selectedFolderForModal={selectedFolderForModal}
        onFolderModalConfirm={handleFolderModalConfirm}
        showFolderModal={folderNavigation === 'content'}
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
            onPromptChange={handleImageToVideoPromptChange}
            onSubmit={handleImageToVideoSubmit}
            onClose={handleCloseImageToVideoModal}
          />
        )}
    </>
  );
}
