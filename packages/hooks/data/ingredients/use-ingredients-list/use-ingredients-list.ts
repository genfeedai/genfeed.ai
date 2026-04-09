'use client';

import { PageScope } from '@genfeedai/enums';
import type {
  IngredientsListProps,
  UseIngredientsListReturn,
} from '@genfeedai/props/pages/ingredients-list.props';
import { useIngredientsActions } from '@hooks/data/ingredients/use-ingredients-list/use-ingredients-actions';
import { useIngredientsFilters } from '@hooks/data/ingredients/use-ingredients-list/use-ingredients-filters';
import { useIngredientsGeneration } from '@hooks/data/ingredients/use-ingredients-list/use-ingredients-generation';
import { useIngredientsLoading } from '@hooks/data/ingredients/use-ingredients-list/use-ingredients-loading';
import { useCallback, useMemo } from 'react';

export type { ImageToVideoGenerationPayload } from '@genfeedai/interfaces';

export function useIngredientsList({
  type,
  scope = PageScope.BRAND,
}: IngredientsListProps): UseIngredientsListReturn {
  const filterState = useIngredientsFilters({ scope, type });

  const {
    brandId,
    clearFilters,
    currentPage,
    form,
    formatFilter,
    getFilteredIngredients,
    getMediaIngredients,
    isActionsEnabled,
    onRefresh,
    organizationId,
    parsedSearchParams,
    pathname,
    query,
    router,
    searchParamsString,
    setIsRefreshing,
    setQuery,
    singularType,
  } = filterState;

  const loadingState = useIngredientsLoading({
    brandId,
    currentPage,
    form,
    formatFilter,
    onRefresh,
    organizationId,
    parsedSearchParams,
    query,
    scope,
    setIsRefreshing,
    singularType,
    type,
  });

  const {
    cachedAt,
    findAllFolders,
    findAllIngredientsByCategory,
    folders,
    getBulkIngredientsService,
    ingredients,
    isLoading,
    isLoadingFolders,
    isUsingCache,
    notificationsService,
    selectedFolderId,
    setIngredients,
    setSelectedFolderId,
    socketSubscriptionsRef,
  } = loadingState;

  const generationState = useIngredientsGeneration({
    findAllIngredientsByCategory,
    notificationsService,
  });

  const actionsState = useIngredientsActions({
    brandId,
    findAllFolders,
    findAllIngredientsByCategory,
    formatFilter,
    getBulkIngredientsService,
    ingredients,
    notificationsService,
    onConvertToVideo: generationState.handleConvertToVideo,
    pathname,
    query,
    router,
    scope,
    searchParamsString,
    selectedFolderId,
    setIngredients,
    setQuery,
    setSelectedFolderId,
    singularType,
    socketSubscriptionsRef,
    type,
  });

  const filteredIngredients = useMemo(
    () => getFilteredIngredients(ingredients),
    [getFilteredIngredients, ingredients],
  );

  const mediaIngredients = useMemo(
    () => getMediaIngredients(filteredIngredients),
    [getMediaIngredients, filteredIngredients],
  );

  const hasFilteredEmptyState = useMemo(
    () =>
      !isLoading && ingredients.length > 0 && filteredIngredients.length === 0,
    [filteredIngredients, ingredients.length, isLoading],
  );

  const openLightboxForIngredient = useCallback(
    (
      ingredient: Parameters<
        UseIngredientsListReturn['openLightboxForIngredient']
      >[0],
    ) => actionsState.openLightboxForIngredient(ingredient, mediaIngredients),
    [actionsState.openLightboxForIngredient, mediaIngredients],
  );

  return {
    blacklists: generationState.blacklists,
    brandId,
    cachedAt,
    cameras: generationState.cameras,
    clearFilters,
    closeLightbox: actionsState.closeLightbox,
    filteredIngredients,
    folders,
    fontFamilies: generationState.fontFamilies,
    formatFilter,
    handleArchiveIngredient: actionsState.handleArchiveIngredient,
    handleBulkDelete: actionsState.handleBulkDelete,
    handleClearSelection: actionsState.handleClearSelection,
    handleCloseImageToVideoModal: generationState.handleCloseImageToVideoModal,
    handleConvertToPortrait: actionsState.handleConvertToPortrait,
    handleConvertToVideo: generationState.handleConvertToVideo,
    handleCopyPrompt: actionsState.handleCopyPrompt,
    handleCreateFolder: actionsState.handleCreateFolder,
    handleDeleteIngredient: actionsState.handleDeleteIngredient,
    handleFolderDrop: actionsState.handleFolderDrop,
    handleFolderModalConfirm: actionsState.handleFolderModalConfirm,
    handleGenerateCaptions: actionsState.handleGenerateCaptions,
    handleImageToVideoPromptChange:
      generationState.handleImageToVideoPromptChange,
    handleImageToVideoSubmit: generationState.handleImageToVideoSubmit,
    handleMerge: actionsState.handleMerge,
    handleMirror: actionsState.handleMirror,
    handleRefresh: actionsState.handleRefresh,
    handleReprompt: actionsState.handleReprompt,
    handleReverse: actionsState.handleReverse,
    handleScopeChange: actionsState.handleScopeChange,
    handleSeeDetails: actionsState.handleSeeDetails,
    handleSelectFolder: actionsState.handleSelectFolder,
    handleUpdateParent: actionsState.handleUpdateParent,
    hasFilteredEmptyState,
    imageToVideoPromptData: generationState.imageToVideoPromptData,
    imageToVideoTarget: generationState.imageToVideoTarget,
    ingredients,
    isActionsEnabled,
    isDragEnabled: isActionsEnabled,
    isGeneratingCaptions: actionsState.isGeneratingCaptions,
    isImageToVideoGenerating: generationState.isImageToVideoGenerating,
    isLoading,
    isLoadingFolders,
    isMerging: actionsState.isMerging,
    isMirroring: actionsState.isMirroring,
    isPortraiting: actionsState.isPortraiting,
    isReversing: actionsState.isReversing,
    isUsingCache,
    lightboxIndex: actionsState.lightboxIndex,
    lightboxOpen: actionsState.lightboxOpen,
    mediaIngredients,
    moods: generationState.moods,
    openIngredientModal: actionsState.openIngredientModal,
    openLightboxForIngredient,
    presets: generationState.presets,
    scope,
    selectedFolderForModal: actionsState.selectedFolderForModal,
    selectedFolderId,
    selectedIngredientIds: actionsState.selectedIngredientIds,
    setIngredients,
    setSelectedIngredientIds: actionsState.setSelectedIngredientIds,
    singularType,
    sounds: generationState.sounds,
    styles: generationState.styles,
    tags: generationState.availableTags,
    type,
    videoModels: generationState.videoModels,
  };
}

export default useIngredientsList;
