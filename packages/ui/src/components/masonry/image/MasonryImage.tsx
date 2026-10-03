'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { ContentRating, IngredientStatus } from '@genfeedai/contracts';
import type {
  IImage,
  IIngredient,
  IMetadata,
} from '@genfeedai/contracts/interfaces';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useAuthorizedMediaPreview } from '@genfeedai/hooks/media/use-authorized-media-preview';
import useIngredientActions from '@genfeedai/hooks/ui/ingredient/use-ingredient-actions/use-ingredient-actions';
import type { MasonryImageProps } from '@genfeedai/props/content/masonry.props';
import { getIngredientFailureReason } from '@genfeedai/utils/media/ingredient-ledger.util';
import DraggableIngredient from '@ui/drag-drop/draggable/DraggableIngredient';
import DropZoneIngredient from '@ui/drag-drop/zone-ingredient/DropZoneIngredient';
import MasonryBrandLogo from '@ui/masonry/shared/MasonryBrandLogo';
import MasonryConfirmBridge from '@ui/masonry/shared/MasonryConfirmBridge';
import MasonrySelectionToggle from '@ui/masonry/shared/MasonrySelectionToggle';
import {
  useIngredientDownloadHandler,
  useMasonryHover,
} from '@ui/masonry/shared/useMasonryHover';
import { SCROLL_FOCUS_SURFACE_CLASS } from '@ui/styles/scroll-focus';
import { type SyntheticEvent, useCallback, useState } from 'react';
import MasonryImageActionsBar from './MasonryImageActionsBar';
import MasonryImageMediaArea from './MasonryImageMediaArea';
import { getAspectRatioStyle, getImageSrc } from './masonry-image.helpers';

type IngredientActions = ReturnType<typeof useIngredientActions>;

// An intersection, not `interface … extends`: a workspace that cannot
// resolve `MasonryImageProps` then degrades to `any` instead of an empty type.
type MasonryImageTileProps = MasonryImageProps & {
  /** Present only when the tile offers actions. */
  actions?: IngredientActions;
};

/**
 * A read-only tile (public galleries and profiles) never calls
 * `useIngredientActions`: that hook reads the app's elements, brand, socket
 * and service contexts, which pages without the app's providers do not mount.
 */
export default function MasonryImage(
  props: MasonryImageProps,
): React.ReactElement {
  if (props.isActionsEnabled === false) {
    return <MasonryImageTile {...props} />;
  }

  return <MasonryImageWithActions {...props} />;
}

function MasonryImageWithActions(props: MasonryImageProps): React.ReactElement {
  const actions = useIngredientActions({
    onConvertToVideo: props.onConvertToVideo,
    onDeleteIngredient: props.onDeleteIngredient,
    onPublishIngredient: props.onPublishIngredient,
    onRefresh: props.onRefresh,
  });

  return <MasonryImageTile {...props} actions={actions} />;
}

function MasonryImageTile({
  actions,
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
  onShareIngredient,
  onVoteIngredient,
  onClickIngredient,
  onToggleSelection,
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
  onMediaError,
  onScopeChange,
  onRefresh,
  isDragEnabled = true,
  onHoverChange,
}: MasonryImageTileProps): React.ReactElement {
  const { selectedBrand, settings } = useBrand();
  const [loadedImageUrl, setLoadedImageUrl] = useState<string | null>(null);
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const [intrinsicImage, setIntrinsicImage] = useState<{
    height: number;
    url: string;
    width: number;
  } | null>(null);

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

  const handleDownload = useIngredientDownloadHandler();

  const isProcessing = image.status === IngredientStatus.PROCESSING;
  const isFailed = image.status === IngredientStatus.FAILED;
  const failureReason = getIngredientFailureReason(image);

  const mediaPreview = useAuthorizedMediaPreview(image);
  const currentImageUrl = mediaPreview
    ? (mediaPreview.url ?? '')
    : (image.ingredientUrl ?? '');
  // A still-processing asset has no generated URL yet — that is not an error,
  // the processing overlay covers it. Only treat a missing or failed URL as a
  // fallback when the asset is not actively processing.
  const imageError =
    !isProcessing &&
    (currentImageUrl === '' || failedImageUrl === currentImageUrl);
  const isLoading =
    currentImageUrl !== '' && loadedImageUrl !== currentImageUrl && !imageError;

  const handleImageLoad = useCallback(
    (event: SyntheticEvent<HTMLImageElement>) => {
      // After a real-image error, imageSrc swaps to the placeholder; when that
      // placeholder finishes loading, onLoad fires again. Do not report the
      // placeholder (or a missing URL) to the parent as a successful asset load.
      if (currentImageUrl === '' || failedImageUrl === currentImageUrl) {
        return;
      }

      const { naturalHeight, naturalWidth } = event.currentTarget;
      if (naturalHeight > 0 && naturalWidth > 0) {
        setIntrinsicImage({
          height: naturalHeight,
          url: currentImageUrl,
          width: naturalWidth,
        });
      }

      setLoadedImageUrl(currentImageUrl);
      onImageLoad?.();
    },
    [currentImageUrl, failedImageUrl, onImageLoad],
  );

  const handleImageError = useCallback(() => {
    setLoadedImageUrl(currentImageUrl);
    setFailedImageUrl(currentImageUrl);
    onMediaError?.();
  }, [currentImageUrl, onMediaError]);

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
  const currentIntrinsicImage =
    intrinsicImage?.url === currentImageUrl ? intrinsicImage : null;
  const resolvedAspectRatioStyle = currentIntrinsicImage
    ? getAspectRatioStyle(isSquare, currentIntrinsicImage)
    : getAspectRatioStyle(isSquare, metadata);
  // An unsized tile collapses inside a masonry column and letterboxes the
  // image against `object-contain`. Reserve a portrait slot until the natural
  // dimensions arrive, then the real ratio takes over and fills exactly.
  const aspectRatioStyle =
    resolvedAspectRatioStyle ??
    (isSquare ? undefined : { aspectRatio: '4 / 5' });
  const imageSrc = getImageSrc(currentImageUrl, imageError);
  const shouldShowBadges = isActionsEnabled && !isProcessing && !isFailed;
  const useDragDrop = isDragEnabled && onUpdateParent;
  const isFleetNsfwSensitive =
    selectedBrand?.isFleetEnabled &&
    !!image.personaSlug &&
    image.contentRating !== ContentRating.SFW;
  const isFleetNsfwLocked =
    Boolean(isFleetNsfwSensitive) && !settings?.isFleetNsfwVisible;

  const handleContentClick = useCallback(
    (e: React.MouseEvent) => {
      if (isFleetNsfwLocked) {
        return;
      }

      const isQuickActionsClick = (e.target as HTMLElement).closest(
        '.quick-actions-wrapper',
      );
      if (!isQuickActionsClick) {
        onClickIngredient?.(image);
      }
    },
    [isFleetNsfwLocked, onClickIngredient, image],
  );

  const content = (
    <div
      className={cn(
        'relative w-full group rounded-card',
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
        isFailed={isFailed}
        failureReason={failureReason}
        isFleetNsfwLocked={isFleetNsfwLocked}
        isSquare={isSquare}
        aspectRatioStyle={aspectRatioStyle}
        imageSrc={imageSrc}
        handleImageLoad={handleImageLoad}
        handleImageError={handleImageError}
        handleContentClick={handleContentClick}
        onRefresh={onRefresh}
        onReprompt={onReprompt}
      />

      {shouldShowBadges && (
        <MasonryBrandLogo
          ingredient={image}
          isPublicGallery={isPublicGallery}
          isPublicProfile={isPublicProfile}
        />
      )}

      {isActionsEnabled && onToggleSelection && (
        <MasonrySelectionToggle
          ingredient={image}
          isSelected={isSelected}
          onToggleSelection={onToggleSelection}
        />
      )}

      {actions ? (
        <MasonryImageActionsBar
          image={image}
          isActionsEnabled={isActionsEnabled}
          isSelected={isSelected}
          showActions={showActions}
          actionStates={actions.actionStates}
          handlers={actions.handlers}
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
      ) : null}
    </div>
  );

  const confirmBridge = isActionsEnabled && actions && (
    <MasonryConfirmBridge
      upscaleConfirmData={actions.upscaleConfirmData}
      executeUpscale={actions.executeUpscale}
      clearUpscaleConfirm={actions.clearUpscaleConfirm}
      enhanceConfirmData={actions.enhanceConfirmData}
      executeEnhance={actions.executeEnhance}
      clearEnhanceConfirm={actions.clearEnhanceConfirm}
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
