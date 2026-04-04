'use client';

import type { IImage, IIngredient, IVideo } from '@genfeedai/interfaces';
import { EMPTY_STATES } from '@genfeedai/constants';
import { IngredientFormat, MediaType, TagCategory } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useTags } from '@hooks/data/tags/use-tags/use-tags';
import { useMasonryHoverController } from '@hooks/ui/use-masonry-hover-controller/use-masonry-hover-controller';
import { Video } from '@models/ingredients/video.model';
import type { IngredientListProps } from '@props/content/ingredient.props';
import CardEmpty from '@ui/card/empty/CardEmpty';
import { SkeletonMasonryGrid } from '@ui/display/skeleton/skeleton';
import {
  LazyMasonryImage,
  LazyMasonryVideo,
} from '@ui/lazy/masonry/LazyMasonry';
import { isVideoIngredient } from '@utils/media/ingredient-type.util';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

function getColumnsConfig(format?: IngredientFormat): {
  mobile: number;
  tablet: number;
  desktop: number;
} {
  if (format === IngredientFormat.LANDSCAPE) {
    return { desktop: 2, mobile: 1, tablet: 2 };
  }
  if (format === IngredientFormat.PORTRAIT) {
    return { desktop: 4, mobile: 2, tablet: 3 };
  }
  return { desktop: 3, mobile: 2, tablet: 3 };
}

function getMediaType(ingredient: IIngredient): MediaType {
  return isVideoIngredient(ingredient) ? MediaType.VIDEO : MediaType.IMAGE;
}

const INITIAL_BATCH_SIZE = 24;
const BATCH_SIZE = 24;

export default function MasonryGrid({
  ingredients,
  selectedIngredientId,
  scrollFocusedIngredientId,
  isActionsEnabled = true,
  highlightSelection = true,
  isSquare = false,
  isLoading = false,
  isPortraiting = false,
  isGeneratingCaptions = false,
  isDragEnabled = false,
  ignoreFormatCompatibility = false,
  emptyLabel = EMPTY_STATES.DEFAULT,
  format,
  onClickIngredient,
  onDeleteIngredient,
  onVoteIngredient,
  onPublishIngredient,
  onToggleFavorite,
  onCopyPrompt,
  onReprompt,
  onEditIngredient,
  onMarkArchived,
  onMarkValidated,
  onMarkRejected,
  onSeeDetails,
  onConvertToVideo,
  onUseAsVideoReference,
  onCreateVariation,
  onConvertToPortrait,
  onGenerateCaptions,
  onUpdateParent,
  onScopeChange,
  onRefresh,
}: IngredientListProps): React.ReactElement {
  const [visibleCount, setVisibleCount] = useState(INITIAL_BATCH_SIZE);
  const [viewportWidth, setViewportWidth] = useState(0);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const { tags, isLoading: isLoadingTags } = useTags({
    autoLoad: isActionsEnabled,
    scope: TagCategory.INGREDIENT,
  });

  const columnsConfig = useMemo(() => getColumnsConfig(format), [format]);
  const columnCount = useMemo(() => {
    if (viewportWidth >= 1024) {
      return columnsConfig.desktop;
    }
    if (viewportWidth >= 640) {
      return columnsConfig.tablet;
    }
    return columnsConfig.mobile;
  }, [
    columnsConfig.desktop,
    columnsConfig.mobile,
    columnsConfig.tablet,
    viewportWidth,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleResize = () => {
      setViewportWidth(window.innerWidth);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const validIngredients = useMemo(
    () =>
      ingredients.filter((ingredient: IIngredient) => Boolean(ingredient?.id)),
    [ingredients],
  );

  useEffect(() => {
    setVisibleCount(Math.min(INITIAL_BATCH_SIZE, validIngredients.length));
  }, [validIngredients.length]);

  useEffect(() => {
    if (!scrollFocusedIngredientId || !containerRef.current) {
      return;
    }

    const target = containerRef.current.querySelector<HTMLElement>(
      `[data-ingredient-id="${scrollFocusedIngredientId}"]`,
    );

    target?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      inline: 'nearest',
    });
  }, [scrollFocusedIngredientId, validIngredients]);

  const loadNextBatch = useCallback(() => {
    setVisibleCount((prev) =>
      Math.min(prev + BATCH_SIZE, validIngredients.length),
    );
  }, [validIngredients.length]);

  useEffect(() => {
    if (visibleCount >= validIngredients.length || !loadMoreRef.current) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry?.isIntersecting) {
          loadNextBatch();
        }
      },
      { rootMargin: '400px 0px' },
    );

    observer.observe(loadMoreRef.current);

    return () => observer.disconnect();
  }, [loadNextBatch, validIngredients.length, visibleCount]);

  const { registerItem, createHoverChangeHandler } =
    useMasonryHoverController(containerRef);

  const { selectedIngredientIds, requiredFormat } = useMemo(() => {
    if (!highlightSelection || selectedIngredientId.length === 0) {
      return { requiredFormat: undefined, selectedIngredientIds: null };
    }

    const ids = new Set(selectedIngredientId);
    const firstId = selectedIngredientId[0];
    const firstIngredient = validIngredients.find(
      (ingredient: IIngredient) => ingredient.id === firstId,
    );

    return {
      requiredFormat: firstIngredient?.ingredientFormat,
      selectedIngredientIds: ids,
    };
  }, [highlightSelection, selectedIngredientId, validIngredients]);

  const handleImageLoad = useCallback(() => {
    // CSS column masonry does not need JS-driven relayouts
  }, []);

  const sharedProps = useMemo(
    () => ({
      availableTags: tags,
      isActionsEnabled,
      isContainerHovered: true,
      isDragEnabled,
      isLoadingTags,
      onClickIngredient,
      onCopyPrompt,
      onDeleteIngredient,
      onEditIngredient,
      onImageLoad: handleImageLoad,
      onMarkArchived,
      onMarkRejected,
      onMarkValidated,
      onPublishIngredient,
      onRefresh,
      onReprompt,
      onScopeChange,
      onSeeDetails,
      onToggleFavorite,
      onUpdateParent,
      onVoteIngredient,
    }),
    [
      tags,
      isActionsEnabled,
      isDragEnabled,
      isLoadingTags,
      onClickIngredient,
      onCopyPrompt,
      onDeleteIngredient,
      onEditIngredient,
      handleImageLoad,
      onMarkArchived,
      onMarkRejected,
      onMarkValidated,
      onPublishIngredient,
      onRefresh,
      onReprompt,
      onScopeChange,
      onSeeDetails,
      onToggleFavorite,
      onUpdateParent,
      onVoteIngredient,
    ],
  );

  if (isLoading) {
    return <SkeletonMasonryGrid count={12} />;
  }

  if (validIngredients.length === 0) {
    return <CardEmpty label={emptyLabel} />;
  }

  const displayedIngredients = validIngredients.slice(0, visibleCount);

  return (
    <div
      ref={containerRef}
      className={cn('masonry-container transition-all duration-300')}
      style={{
        columnCount,
        columnGap: '8px',
      }}
    >
      {displayedIngredients.map((ingredient: IIngredient) => {
        const mediaType = getMediaType(ingredient);
        const isFormatCompatible =
          ignoreFormatCompatibility ||
          !requiredFormat ||
          ingredient.ingredientFormat === requiredFormat;
        const isSelected =
          highlightSelection &&
          Boolean(selectedIngredientIds?.has(ingredient.id));
        const isScrollFocused = scrollFocusedIngredientId === ingredient.id;

        return (
          <div
            key={ingredient.id}
            ref={registerItem(ingredient.id)}
            className="masonry-item mb-2 break-inside-avoid transition-all duration-300 ease-out data-[dimmed=true]:opacity-35"
            data-ingredient-id={ingredient.id}
            data-hovered="false"
            data-dimmed="false"
            data-masonry-media={mediaType}
          >
            {mediaType === MediaType.IMAGE ? (
              <LazyMasonryImage
                {...sharedProps}
                image={ingredient as IImage}
                isFormatCompatible={isFormatCompatible}
                isScrollFocused={isScrollFocused}
                isSelected={isSelected}
                isSquare={isSquare}
                onConvertToVideo={onConvertToVideo}
                onUseAsVideoReference={onUseAsVideoReference}
                onCreateVariation={onCreateVariation}
                onHoverChange={createHoverChangeHandler(ingredient.id)}
              />
            ) : (
              <LazyMasonryVideo
                {...sharedProps}
                video={new Video(ingredient as IVideo)}
                isFormatCompatible={isFormatCompatible}
                isGeneratingCaptions={isGeneratingCaptions}
                isPortraiting={isPortraiting}
                isScrollFocused={isScrollFocused}
                isSelected={isSelected}
                onPortraitVideo={onConvertToPortrait}
                onGenerateCaptions={onGenerateCaptions}
                onHoverChange={createHoverChangeHandler(ingredient.id)}
              />
            )}
          </div>
        );
      })}
      {visibleCount < validIngredients.length && (
        <div ref={loadMoreRef} className="h-8 w-full" />
      )}
    </div>
  );
}
