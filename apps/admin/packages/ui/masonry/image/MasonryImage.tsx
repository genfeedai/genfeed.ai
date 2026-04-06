'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  ButtonSize,
  ButtonVariant,
  ComponentSize,
  IngredientStatus,
} from '@genfeedai/enums';
import type { IImage, IIngredient, IMetadata } from '@genfeedai/interfaces';
import { cn } from '@helpers/formatting/cn/cn.util';
import useIngredientActions from '@hooks/ui/ingredient/use-ingredient-actions/use-ingredient-actions';
import type { MasonryImageProps } from '@props/content/masonry.props';
import { EnvironmentService } from '@services/core/environment.service';
import Button from '@ui/buttons/base/Button';
import DraggableIngredient from '@ui/drag-drop/draggable/DraggableIngredient';
import DropZoneIngredient from '@ui/drag-drop/zone-ingredient/DropZoneIngredient';
import DropdownStatus from '@ui/dropdowns/status/DropdownStatus';
import Spinner from '@ui/feedback/spinner/Spinner';
import MasonryBadgeOverlay from '@ui/masonry/shared/MasonryBadgeOverlay';
import MasonryBrandLogo from '@ui/masonry/shared/MasonryBrandLogo';
import MasonryConfirmBridge from '@ui/masonry/shared/MasonryConfirmBridge';
import {
  createDownloadHandler,
  useMasonryHover,
} from '@ui/masonry/shared/useMasonryHover';
import IngredientQuickActions from '@ui/quick-actions/actions/IngredientQuickActions';
import { SCROLL_FOCUS_SURFACE_CLASS } from '@ui/styles/scroll-focus';
import Image from 'next/image';
import { useCallback, useMemo, useState } from 'react';
import { HiHandThumbUp } from 'react-icons/hi2';

const BLUR_PLACEHOLDER =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAhEAACAQMDBQAAAAAAAAAAAAABAgMABAUGIWEREiMxUf/EABUBAQEAAAAAAAAAAAAAAAAAAAMF/8QAGhEAAgIDAAAAAAAAAAAAAAAAAAECEgMRkf/aAAwDAQACEQMRAD8AltJagyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyJckliyjqTzSlT54b6bk+h0R//2Q==';
const MASONRY_TILE_RADIUS_CLASS = 'rounded-lg';

function getAspectRatioStyle(
  isSquare: boolean,
  metadata: IMetadata | undefined,
): React.CSSProperties | undefined {
  if (isSquare || !metadata?.width || !metadata?.height) {
    return undefined;
  }
  return { aspectRatio: `${metadata.width} / ${metadata.height}` };
}

function getImageSrc(
  ingredientUrl: string | undefined,
  hasError: boolean,
): string {
  const isInvalidUrl = hasError || !ingredientUrl || ingredientUrl === '';
  if (isInvalidUrl) {
    return `${EnvironmentService.assetsEndpoint}/placeholders/portrait.jpg`;
  }
  return ingredientUrl;
}

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
  const [isLoading, setIsLoading] = useState(true);
  const [imageError, setImageError] = useState(false);

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

  const handleImageLoad = useCallback(() => {
    setIsLoading(false);
    setImageError(false);
    onImageLoad?.();
  }, [onImageLoad]);

  const handleImageError = useCallback(() => {
    setIsLoading(false);
    setImageError(true);
  }, []);

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
  const isProcessing = image.status === IngredientStatus.PROCESSING;
  const isFailed = image.status === IngredientStatus.FAILED;
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
      <div
        role="button"
        tabIndex={0}
        data-testid={`masonry-ingredient-${image.id}`}
        className={cn(
          'relative h-full w-full cursor-pointer overflow-hidden border border-white/[0.08] bg-card transition-[border-color,background-color] duration-200 hover:border-white/[0.14]',
          isDarkroomLocked && 'cursor-not-allowed',
          MASONRY_TILE_RADIUS_CLASS,
        )}
        onClick={handleContentClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleContentClick(e as unknown as React.MouseEvent);
          }
        }}
      >
        {isLoading && (
          <div
            className={cn(
              'absolute inset-0 masonry-skeleton rounded-lg',
              isSquare && 'aspect-square',
            )}
            style={aspectRatioStyle}
          >
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <Spinner size={ComponentSize.SM} className="text-white" />
            </div>
          </div>
        )}

        <Image
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          onLoad={handleImageLoad}
          onError={handleImageError}
          loading={imageError ? 'eager' : 'lazy'}
          placeholder="blur"
          blurDataURL={BLUR_PLACEHOLDER}
          alt={image.promptText || 'Image'}
          width={metadata?.width || 1080}
          height={metadata?.height || 1920}
          className={cn(
            'w-full h-full transition-opacity duration-300',
            (isProcessing || isDarkroomLocked) && 'blur-sm',
            isSquare ? 'object-cover object-center' : 'object-contain',
            isLoading ? 'opacity-0' : 'opacity-100',
          )}
          src={imageSrc}
        />

        {isDarkroomLocked && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/35 backdrop-blur-sm px-4 text-center">
            <div className="rounded-full border border-white/20 bg-black/50 px-3 py-1 text-xs font-medium text-white">
              Sensitive darkroom asset
            </div>
          </div>
        )}
      </div>

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

      {isProcessing && (
        <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none rounded-lg bg-black/20 backdrop-blur-sm">
          <div
            className="pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <DropdownStatus
              entity={image}
              onStatusChange={onRefresh}
              className="scale-110"
            />
          </div>
        </div>
      )}

      {isActionsEnabled && (
        <div
          className={cn(
            'absolute inset-x-0 bottom-0 z-50 border-t border-white/[0.08] bg-black/72 p-2 backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100 overflow-visible',
            showActions ? 'opacity-100' : 'opacity-0 pointer-events-none',
          )}
        >
          <div className="flex items-end justify-end gap-2">
            <div className="flex-shrink-0 flex items-center gap-2">
              {onVoteIngredient ? (
                <VoteButton image={image} onVote={onVoteIngredient} />
              ) : (
                showActions && (
                  <QuickActionsWrapper
                    image={image}
                    actionStates={actionStates}
                    handlers={handlers}
                    availableTags={availableTags}
                    isLoadingTags={isLoadingTags}
                    isSelected={isSelected}
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
                    handleDownload={handleDownload}
                    handleQuickActionsMouseEnter={handleQuickActionsMouseEnter}
                    handleQuickActionsMouseLeave={handleQuickActionsMouseLeave}
                  />
                )
              )}
            </div>
          </div>
        </div>
      )}
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

interface VoteButtonProps {
  image: MasonryImageProps['image'];
  onVote: (image: MasonryImageProps['image']) => void;
}

function VoteButton({ image, onVote }: VoteButtonProps): React.ReactElement {
  return (
    <Button
      onClick={() => onVote(image)}
      label={
        <>
          <HiHandThumbUp /> {image.totalVotes || 0}
        </>
      }
      variant={image.hasVoted ? ButtonVariant.DEFAULT : ButtonVariant.DEFAULT}
      size={ButtonSize.SM}
      className={cn(
        image.hasVoted && 'bg-success text-white cursor-default',
        image.isVoteAnimating && 'animate-vote',
      )}
    />
  );
}

interface QuickActionsWrapperProps {
  image: MasonryImageProps['image'];
  actionStates: ReturnType<typeof useIngredientActions>['actionStates'];
  handlers: ReturnType<typeof useIngredientActions>['handlers'];
  availableTags: MasonryImageProps['availableTags'];
  isLoadingTags: MasonryImageProps['isLoadingTags'];
  isSelected: boolean;
  onPublishIngredient: MasonryImageProps['onPublishIngredient'];
  onSeeDetails: MasonryImageProps['onSeeDetails'];
  onShareIngredient: MasonryImageProps['onShareIngredient'];
  onToggleFavorite: MasonryImageProps['onToggleFavorite'];
  onCopyPrompt: MasonryImageProps['onCopyPrompt'];
  onReprompt: MasonryImageProps['onReprompt'];
  onConvertToVideo: MasonryImageProps['onConvertToVideo'];
  onUseAsVideoReference: MasonryImageProps['onUseAsVideoReference'];
  onCreateVariation: MasonryImageProps['onCreateVariation'];
  onReverse: MasonryImageProps['onReverse'];
  onMirror: MasonryImageProps['onMirror'];
  onMarkValidated: MasonryImageProps['onMarkValidated'];
  onMarkRejected: MasonryImageProps['onMarkRejected'];
  onMarkArchived: MasonryImageProps['onMarkArchived'];
  onScopeChange: MasonryImageProps['onScopeChange'];
  onRefresh: MasonryImageProps['onRefresh'];
  handleDownload: ReturnType<typeof createDownloadHandler>;
  handleQuickActionsMouseEnter: () => void;
  handleQuickActionsMouseLeave: (e: React.MouseEvent) => void;
}

function QuickActionsWrapper({
  image,
  actionStates,
  handlers,
  availableTags,
  isLoadingTags,
  isSelected,
  onPublishIngredient,
  onSeeDetails,
  onShareIngredient,
  onToggleFavorite,
  onCopyPrompt,
  onReprompt,
  onConvertToVideo,
  onUseAsVideoReference,
  onCreateVariation,
  onReverse,
  onMirror,
  onMarkValidated,
  onMarkRejected,
  onMarkArchived,
  onScopeChange,
  onRefresh,
  handleDownload,
  handleQuickActionsMouseEnter,
  handleQuickActionsMouseLeave,
}: QuickActionsWrapperProps): React.ReactElement {
  return (
    <div
      className="quick-actions-wrapper flex items-center gap-2"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseEnter={handleQuickActionsMouseEnter}
      onMouseLeave={handleQuickActionsMouseLeave}
    >
      <IngredientQuickActions
        {...actionStates}
        isMasonryCompact
        selectedIngredient={image}
        availableTags={availableTags}
        isLoadingTags={isLoadingTags}
        isSelected={isSelected}
        onPublish={onPublishIngredient}
        onUpscale={handlers.handleUpscale}
        onClone={handlers.handleClone}
        onSeeDetails={onSeeDetails}
        onShare={onShareIngredient}
        onDelete={handlers.handleDelete}
        onToggleFavorite={onToggleFavorite}
        onCopy={onCopyPrompt}
        onReprompt={onReprompt}
        onConvertToVideo={onConvertToVideo}
        onUseAsVideoReference={onUseAsVideoReference}
        onCreateVariation={onCreateVariation}
        onReverse={onReverse || handlers.handleReverse}
        onMirror={onMirror || handlers.handleMirror}
        onPortrait={handlers.handlePortrait}
        onSquare={handlers.handleSquare}
        onLandscape={handlers.handleLandscape}
        onMarkValidated={onMarkValidated}
        onMarkRejected={onMarkRejected}
        onMarkArchived={onMarkArchived}
        onSetAsLogo={handlers.handleSetAsLogo}
        onSetAsBanner={handlers.handleSetAsBanner}
        onDownload={async (ingredient) => {
          await handleDownload(ingredient);
          return undefined;
        }}
        onScopeChange={onScopeChange}
        onRefresh={onRefresh}
      />
    </div>
  );
}
