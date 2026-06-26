'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { IngredientStatus } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import useIngredientActions from '@genfeedai/hooks/ui/ingredient/use-ingredient-actions/use-ingredient-actions';
import type { IImage, IIngredient, IMetadata } from '@genfeedai/interfaces';
import type { MasonryImageProps } from '@genfeedai/props/content/masonry.props';
import DraggableIngredient from '@ui/drag-drop/draggable/DraggableIngredient';
import DropZoneIngredient from '@ui/drag-drop/zone-ingredient/DropZoneIngredient';
import MasonryBadgeOverlay from '@ui/masonry/shared/MasonryBadgeOverlay';
import MasonryBrandLogo from '@ui/masonry/shared/MasonryBrandLogo';
import MasonryConfirmBridge from '@ui/masonry/shared/MasonryConfirmBridge';
import {
  createDownloadHandler,
  useMasonryHover,
} from '@ui/masonry/shared/useMasonryHover';
import { SCROLL_FOCUS_SURFACE_CLASS } from '@ui/styles/scroll-focus';
import { useCallback, useMemo, useState } from 'react';
import MasonryImageActionsBar from './MasonryImageActionsBar';
import MasonryImageMediaArea from './MasonryImageMediaArea';
import { getAspectRatioStyle, getImageSrc } from './masonry-image.helpers';

export default function MasonryImage({
  image,
  isSelected = false,
  isScrollFocused = false,
  isActionsEnabled = true,
  isSquare = false,
  isPublicGallery = false,
  isPublicProfile = false,
  isContainerHovered = true,
  availableTags,
  isLoadingTags,
  evaluationScore,
  onShareIngredient,
  onVoteIngredient,
  onClickIngredient,
  onDeleteIngredient,
  onPublishIngredient,
  onToggleFavorite,
  onCopyPrompt,
  onReprompt,
  onMarkValidated,
  onMarkRejected,
  onMarkArchived,
  onSeeDetails,
  onConvertToVideo,
  onUseAsVideoReference,
  onCreateVariation,
  onReverse,
  onMirror,
  onUpdateParent,
  onImageLoad,
  onScopeChange,
  onRefresh,
  isDragEnabled = true,
  onHoverChange,
}: MasonryImageProps): React.ReactElement {
  const { selectedBrand, settings } = useBrand();
  const [loadedImageUrl, setLoadedImageUrl] = useState<string | null>(null);
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);

  const {
    isHovered,
    showActions,
    handleMouseEnter,
    handleMouseLeave,
    handleQuickActionsMouseEnter,
    handleQuickActionsMouseLeave,
  } = useMasonryHover({
    isContainerHovered,
    onHoverChange,
  });

  const {
    actionStates,
    handlers,
    upscaleConfirmData,
    executeUpscale,
    clearUpscaleConfirm,
    enhanceConfirmData,
    executeEnhance,
    clearEnhanceConfirm,
  } = useIngredientActions({
    onConvertToVideo,
    onDeleteIngredient,
    onPublishIngredient,
    onRefresh,
  });

  const handleDownload = useMemo(() => createDownloadHandler(), []);

  const isProcessing = image.status === IngredientStatus.PROCESSING;
  const isFailed = image.status === IngredientStatus.FAILED;

  const currentImageUrl = image.ingredientUrl ?? '';
  // A still-processing asset has no generated URL yet — that is not an error,
  // the processing overlay covers it. Only treat a missing or failed URL as a
  // fallback when the asset is not actively processing.
  const imageError =
    !isProcessing &&
    (currentImageUrl === '' || failedImageUrl === currentImageUrl);
  const isLoading =
    currentImageUrl !== '' && loadedImageUrl !== currentImageUrl && !imageError;

  const handleImageLoad = useCallback(() => {
    // After a real-image error, imageSrc swaps to the placeholder; when that
    // placeholder finishes loading, onLoad fires again. Do not report the
    // placeholder (or a missing URL) to the parent as a successful asset load.
    if (currentImageUrl === '' || failedImageUrl === currentImageUrl) {
      return;
    }
    setLoadedImageUrl(currentImageUrl);
    onImageLoad?.();
  }, [currentImageUrl, failedImageUrl, onImageLoad]);

  const handleImageError = useCallback(() => {
    setLoadedImageUrl(currentImageUrl);
    setFailedImageUrl(currentImageUrl);
  }, [currentImageUrl]);

  const handleIngredientDrop = useCallback(
    (
      droppedIngredient: Pick<IIngredient, 'id' | 'folder'>,
      targetIngredient: IIngredient,
    ) => {
      if (onUpdateParent && droppedIngredient.id !== targetIngredient.id) {
        onUpdateParent(droppedIngredient as IImage, targetIngredient.id);
      }
    },
    [onUpdateParent],
  );

  const metadata = image?.metadata as IMetadata;
  const aspectRatioStyle = getAspectRatioStyle(isSquare, metadata);
  const imageSrc = getImageSrc(image?.ingredientUrl, imageError);
  const shouldShowBadges = isActionsEnabled && !isProcessing && !isFailed;
  const useDragDrop = isDragEnabled && onUpdateParent;
  const isDarkroomSensitive =
    selectedBrand?.isDarkroomEnabled &&
    !!image.personaSlug &&
    image.contentRating !== 'sfw';
  const isDarkroomLocked =
    Boolean(isDarkroomSensitive) && !settings?.isDarkroomNsfwVisible;

  const handleContentClick = useCallback(
    (e: React.MouseEvent) => {
      if (isDarkroomLocked) {
        return;
      }

      const isQuickActionsClick = (e.target as HTMLElement).closest(
        '.quick-actions-wrapper',
      );
      if (!isQuickActionsClick) {
        onClickIngredient?.(image);
      }
    },
    [isDarkroomLocked, onClickIngredient, image],
  );

  const content = (
    <div
      className={cn(
        'relative w-full group rounded-lg',
        isSquare && 'aspect-square',
        isScrollFocused && SCROLL_FOCUS_SURFACE_CLASS,
        isSelected && 'ring-2 ring-primary',
      )}
      style={aspectRatioStyle}
      data-masonry-item="true"
      data-state={isHovered ? 'hovered' : 'idle'}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <MasonryImageMediaArea
        image={image}
        metadata={metadata}
        isLoading={isLoading}
        imageError={imageError}
        isProcessing={isProcessing}
        isDarkroomLocked={isDarkroomLocked}
        isSquare={isSquare}
        aspectRatioStyle={aspectRatioStyle}
        imageSrc={imageSrc}
        handleImageLoad={handleImageLoad}
        handleImageError={handleImageError}
        handleContentClick={handleContentClick}
        onRefresh={onRefresh}
      />

      {shouldShowBadges && (
        <>
          <MasonryBadgeOverlay
            ingredient={image}
            evaluationScore={evaluationScore}
            isPublicGallery={isPublicGallery}
          />
          <MasonryBrandLogo
            ingredient={image}
            isPublicGallery={isPublicGallery}
            isPublicProfile={isPublicProfile}
          />
        </>
      )}

      <MasonryImageActionsBar
        image={image}
        isActionsEnabled={isActionsEnabled}
        isSelected={isSelected}
        showActions={showActions}
        actionStates={actionStates}
        handlers={handlers}
        availableTags={availableTags}
        isLoadingTags={isLoadingTags}
        handleDownload={handleDownload}
        handleQuickActionsMouseEnter={handleQuickActionsMouseEnter}
        handleQuickActionsMouseLeave={handleQuickActionsMouseLeave}
        onVoteIngredient={onVoteIngredient}
        onPublishIngredient={onPublishIngredient}
        onSeeDetails={onSeeDetails}
        onShareIngredient={onShareIngredient}
        onToggleFavorite={onToggleFavorite}
        onCopyPrompt={onCopyPrompt}
        onReprompt={onReprompt}
        onConvertToVideo={onConvertToVideo}
        onUseAsVideoReference={onUseAsVideoReference}
        onCreateVariation={onCreateVariation}
        onReverse={onReverse}
        onMirror={onMirror}
        onMarkValidated={onMarkValidated}
        onMarkRejected={onMarkRejected}
        onMarkArchived={onMarkArchived}
        onScopeChange={onScopeChange}
        onRefresh={onRefresh}
      />
    </div>
  );

  const confirmBridge = isActionsEnabled && (
    <MasonryConfirmBridge
      upscaleConfirmData={upscaleConfirmData}
      executeUpscale={executeUpscale}
      clearUpscaleConfirm={clearUpscaleConfirm}
      enhanceConfirmData={enhanceConfirmData}
      executeEnhance={executeEnhance}
      clearEnhanceConfirm={clearEnhanceConfirm}
    />
  );

  if (useDragDrop) {
    return (
      <>
        <DropZoneIngredient
          ingredient={image}
          onDrop={handleIngredientDrop}
          isEnabled={!image.parent}
        >
          <DraggableIngredient ingredient={image}>
            {content}
          </DraggableIngredient>
        </DropZoneIngredient>
        {confirmBridge}
      </>
    );
  }

  return (
    <>
      {content}
      {confirmBridge}
    </>
  );
}
