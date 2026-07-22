'use client';

import {
  AssetControlsHeader,
  GenerateContentArea,
  StudioComposer,
} from '@pages/studio/generate/components';
import { useStudioGenerateLayout } from '@pages/studio/generate/useStudioGenerateLayout';
import type { StudioGeneratePageProps } from '@props/studio/studio.props';
import MediaLightbox from '@ui/layouts/lightbox/MediaLightbox';

export default function StudioGenerateLayout({
  defaultCategoryType,
  onCategoryChange,
}: StudioGeneratePageProps) {
  const {
    actions,
    allAssets,
    avatarOptions,
    avatarPreviewUrl,
    blacklists,
    cameraMovementPreset,
    cameras,
    categoryType,
    clearStoryboard,
    columns,
    currentModels,
    customCameraPrompt,
    emptyLabel,
    filteredPresets,
    filters,
    findAllAssets,
    folders,
    fontFamilies,
    generateLabel,
    handleBulkDelete,
    handleBulkStatusChange,
    handleCategoryTypeChange,
    handleClearSelection,
    handleConvertImageToVideo,
    handleCreateVariation,
    handleEditIngredient,
    handleFiltersChange,
    handleGenerateStoryboard,
    handleIngredientClick,
    handleLoadMore,
    handleMarkArchived,
    handleMarkRejected,
    handleMarkValidated,
    handlePromptConfigChange,
    handlePublishIngredient,
    handleCopy,
    handleRefresh,
    handleReprompt,
    handleSeeDetails,
    handleSubmit,
    handleToggleFavorite,
    handleViewModeChange,
    hasInterpolationModel,
    hasMore,
    initialLoadComplete,
    isAvatarCategory,
    isAvailabilityLoading,
    isBulkUpdating,
    isEmptyStudioState,
    isGenerationCooldown,
    isImageCategory,
    isImageOrVideo,
    isLoading,
    isLoadingMore,
    isMusicCategory,
    isRefreshing,
    isStoryboardGenerating,
    isVideoCategory,
    lightboxIndex,
    lightboxOpen,
    moods,
    promptConfig,
    promptText,
    resolvedGridFormat,
    scenes,
    scrollFocusedAssetId,
    selectedIngredientIds,
    setCameraMovementPreset,
    setCustomCameraPrompt,
    setLightboxOpen,
    setPromptText,
    setStoryboardFrames,
    setTableSelectedIds,
    sounds,
    storyboardFormat,
    storyboardFrames,
    styles,
    supportsMasonry,
    tableSelectedIds,
    tags,
    trainings,
    viewMode,
    voiceOptions,
  } = useStudioGenerateLayout({ defaultCategoryType, onCategoryChange });

  const studioComposer = (
    <StudioComposer
      promptText={promptText}
      onTextChange={setPromptText}
      promptConfig={promptConfig}
      onConfigChange={handlePromptConfigChange}
      isGenerating={isGenerationCooldown}
      generateLabel={generateLabel}
      models={currentModels}
      trainings={trainings}
      presets={filteredPresets}
      folders={folders ?? undefined}
      categoryType={categoryType}
      onIngredientCategoryChange={handleCategoryTypeChange}
      onSubmit={handleSubmit}
      avatars={isAvatarCategory ? avatarOptions : undefined}
      voices={isAvatarCategory ? voiceOptions : undefined}
      avatarPreviewUrl={avatarPreviewUrl}
      moods={!isMusicCategory ? moods : undefined}
      styles={!isMusicCategory ? styles : undefined}
      cameras={isVideoCategory ? cameras : undefined}
      sounds={isVideoCategory ? sounds : undefined}
      tags={!isMusicCategory ? tags : undefined}
      scenes={!isMusicCategory ? scenes : undefined}
      fontFamilies={!isMusicCategory ? fontFamilies : undefined}
      blacklists={isVideoCategory ? blacklists : undefined}
      isAvailabilityLoading={isAvailabilityLoading}
      isEmptyState={isEmptyStudioState}
    />
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <AssetControlsHeader
        filters={filters}
        onFiltersChange={handleFiltersChange}
        isImageOrVideo={isImageOrVideo}
        supportsMasonry={supportsMasonry}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        categoryType={categoryType}
      />

      <GenerateContentArea
        isVideoCategory={isVideoCategory}
        isEmptyStudioState={isEmptyStudioState}
        emptyComposer={isEmptyStudioState ? studioComposer : undefined}
        cameraMovementPreset={cameraMovementPreset}
        customCameraPrompt={customCameraPrompt}
        storyboardFormat={storyboardFormat}
        storyboardFrames={storyboardFrames}
        hasInterpolationModel={hasInterpolationModel}
        isStoryboardGenerating={isStoryboardGenerating}
        onCameraMovementPresetChange={setCameraMovementPreset}
        onClearStoryboard={clearStoryboard}
        onCustomCameraPromptChange={setCustomCameraPrompt}
        onStoryboardFramesChange={setStoryboardFrames}
        onGenerateStoryboard={handleGenerateStoryboard}
        viewMode={viewMode}
        tableSelectedIds={tableSelectedIds}
        onClearSelection={handleClearSelection}
        onBulkDelete={handleBulkDelete}
        onBulkStatusChange={handleBulkStatusChange}
        isBulkUpdating={isBulkUpdating}
        onLoadMore={handleLoadMore}
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        isLoading={isLoading}
        supportsMasonry={supportsMasonry}
        allAssets={allAssets}
        initialLoadComplete={initialLoadComplete}
        selectedIngredientIds={selectedIngredientIds}
        scrollFocusedAssetId={scrollFocusedAssetId}
        resolvedGridFormat={resolvedGridFormat}
        categoryType={categoryType}
        columns={columns}
        actions={actions}
        emptyLabel={emptyLabel}
        onRefresh={() => findAllAssets(1, false, true)}
        onClickIngredient={handleIngredientClick}
        onToggleFavorite={handleToggleFavorite}
        onCopyPrompt={handleCopy}
        onReprompt={handleReprompt}
        onEditIngredient={handleEditIngredient}
        onMarkValidated={handleMarkValidated}
        onMarkRejected={handleMarkRejected}
        onMarkArchived={handleMarkArchived}
        onSeeDetails={handleSeeDetails}
        onPublishIngredient={handlePublishIngredient}
        onUseAsVideoReference={
          isImageCategory ? handleConvertImageToVideo : undefined
        }
        onCreateVariation={isImageCategory ? handleCreateVariation : undefined}
        onTableSelectionChange={setTableSelectedIds}
      />

      {!isEmptyStudioState && (
        <div className="relative shrink-0">{studioComposer}</div>
      )}

      <MediaLightbox
        items={allAssets}
        startIndex={lightboxIndex}
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
      />
    </div>
  );
}
