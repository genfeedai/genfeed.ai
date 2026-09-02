'use client';

import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { MasonryVideoProps } from '@genfeedai/props/content/masonry.props';
import { getIngredientFailureReason } from '@genfeedai/utils/media/ingredient-ledger.util';
import DraggableIngredient from '@ui/drag-drop/draggable/DraggableIngredient';
import DropZoneIngredient from '@ui/drag-drop/zone-ingredient/DropZoneIngredient';
import MasonryBrandLogo from '@ui/masonry/shared/MasonryBrandLogo';
import MasonryConfirmBridge from '@ui/masonry/shared/MasonryConfirmBridge';
import MasonrySelectionToggle from '@ui/masonry/shared/MasonrySelectionToggle';
import { SCROLL_FOCUS_SURFACE_CLASS } from '@ui/styles/scroll-focus';
import MasonryVideoActionsBar from './MasonryVideoActionsBar';
import MasonryVideoMediaArea from './MasonryVideoMediaArea';
import { useMasonryVideo } from './useMasonryVideo';

const MASONRY_TILE_RADIUS_CLASS = 'rounded-lg';

export default function MasonryVideo({
  video,
  isSelected = false,
  isScrollFocused = false,
  isActionsEnabled = true,
  isFormatCompatible = true,
  isPublicGallery = false,
  isPublicProfile = false,
  isPortraiting = false,
  isGeneratingCaptions = false,
  isMirroring = false,
  isReversing = false,
  availableTags,
  isLoadingTags,
  isContainerHovered = true,
  onShareIngredient,
  onClickIngredient,
  onToggleSelection,
  onDeleteIngredient,
  onVoteIngredient,
  onPublishIngredient,
  onToggleFavorite,
  onCopyPrompt,
  onReprompt,
  onGenerateCaptions,
  onMarkValidated,
  onMarkRejected,
  onSeeDetails,
  onReverse,
  onMirror,
  onUpdateParent,
  onImageLoad,
  onScopeChange,
  onRefresh,
  isDragEnabled = true,
  onHoverChange,
}: MasonryVideoProps) {
  const {
    videoRef,
    isHovered,
    isProcessing,
    isFailed,
    isUnavailable,
    isFleetNsfwLocked,
    isInteractionBlocked,
    placeholderImageUrl,
    thumbnailImageUrl,
    ingredientUrl,
    metadata,
    metadataLabel,
    actionStates,
    handlers,
    upscaleConfirmData,
    executeUpscale,
    clearUpscaleConfirm,
    enhanceConfirmData,
    executeEnhance,
    clearEnhanceConfirm,
    extendConfirmData,
    executeExtend,
    clearExtendConfirm,
    handleDownload,
    handleMouseHover,
    handleQuickActionsMouseEnter,
    handleQuickActionsMouseLeave,
    handleIngredientDrop,
    handleMediaDragStart,
  } = useMasonryVideo({
    video,
    isGeneratingCaptions,
    isPortraiting,
    isContainerHovered,
    isDragEnabled,
    onDeleteIngredient,
    onPublishIngredient,
    onRefresh,
    onUpdateParent,
    onHoverChange,
  });

  const failureReason = getIngredientFailureReason(video);

  const content = (
    <div
      onMouseEnter={() => !isInteractionBlocked && handleMouseHover(true)}
      onMouseLeave={(e) => !isInteractionBlocked && handleMouseHover(false, e)}
      data-masonry-item="true"
      data-state={isHovered ? 'hovered' : 'idle'}
      className={cn(
        'relative block w-full cursor-pointer rounded-xl bg-card shadow-border transition-shadow duration-200 hover:shadow-border-strong',
        isScrollFocused && SCROLL_FOCUS_SURFACE_CLASS,
        video.aspectRatio,
        isSelected && 'ring-2 ring-primary',
        isFleetNsfwLocked && 'cursor-not-allowed',
        isFormatCompatible ? '' : 'opacity-50',
      )}
    >
      {/* Inner wrapper with overflow-hidden for media clipping */}
      <div className={cn('overflow-hidden', MASONRY_TILE_RADIUS_CLASS)}>
        {/* Brand logo for public galleries */}
        <MasonryBrandLogo
          ingredient={video}
          isPublicGallery={isPublicGallery}
          isPublicProfile={isPublicProfile}
        />

        {/* Media content */}
        <MasonryVideoMediaArea
          video={video}
          metadata={metadata}
          isUnavailable={isUnavailable}
          isProcessing={isProcessing}
          isFailed={isFailed}
          failureReason={failureReason}
          isFleetNsfwLocked={isFleetNsfwLocked}
          isDragEnabled={isDragEnabled}
          hasUpdateParent={!!onUpdateParent}
          placeholderImageUrl={placeholderImageUrl}
          thumbnailImageUrl={thumbnailImageUrl}
          ingredientUrl={ingredientUrl}
          metadataLabel={metadataLabel}
          videoRef={videoRef}
          handleMediaDragStart={handleMediaDragStart}
          onClickIngredient={onClickIngredient}
          onRefresh={onRefresh}
          onImageLoad={onImageLoad}
          onReprompt={onReprompt}
        />
      </div>

      {isActionsEnabled && !isUnavailable && onToggleSelection && (
        <MasonrySelectionToggle
          ingredient={video}
          isSelected={isSelected}
          onToggleSelection={onToggleSelection}
        />
      )}

      {/* Quick actions bar */}
      <MasonryVideoActionsBar
        video={video}
        isHovered={isHovered}
        isActionsEnabled={isActionsEnabled}
        isUnavailable={isUnavailable}
        isSelected={isSelected}
        isPortraiting={isPortraiting}
        isGeneratingCaptions={isGeneratingCaptions}
        isMirroring={isMirroring}
        isReversing={isReversing}
        actionStates={actionStates}
        handlers={handlers}
        availableTags={availableTags}
        isLoadingTags={isLoadingTags}
        handleDownload={handleDownload}
        handleQuickActionsMouseEnter={handleQuickActionsMouseEnter}
        handleQuickActionsMouseLeave={handleQuickActionsMouseLeave}
        onVoteIngredient={onVoteIngredient}
        onShareIngredient={onShareIngredient}
        onSeeDetails={onSeeDetails}
        onMarkValidated={onMarkValidated}
        onMarkRejected={onMarkRejected}
        onToggleFavorite={onToggleFavorite}
        onCopyPrompt={onCopyPrompt}
        onReprompt={onReprompt}
        onGenerateCaptions={onGenerateCaptions}
        onScopeChange={onScopeChange}
        onRefresh={onRefresh}
        onReverse={onReverse}
        onMirror={onMirror}
      />
    </div>
  );

  // Wrap with drag/drop if enabled
  if (isDragEnabled && onUpdateParent) {
    return (
      <DropZoneIngredient
        ingredient={video as IIngredient}
        onDrop={handleIngredientDrop}
        isEnabled={!video.parent}
      >
        <DraggableIngredient ingredient={video as IIngredient}>
          {content}
        </DraggableIngredient>
      </DropZoneIngredient>
    );
  }

  return (
    <>
      {content}
      {isActionsEnabled && (
        <MasonryConfirmBridge
          upscaleConfirmData={upscaleConfirmData}
          executeUpscale={executeUpscale}
          clearUpscaleConfirm={clearUpscaleConfirm}
          enhanceConfirmData={enhanceConfirmData}
          executeEnhance={executeEnhance}
          clearEnhanceConfirm={clearEnhanceConfirm}
          extendConfirmData={extendConfirmData}
          executeExtend={executeExtend}
          clearExtendConfirm={clearExtendConfirm}
        />
      )}
    </>
  );
}
