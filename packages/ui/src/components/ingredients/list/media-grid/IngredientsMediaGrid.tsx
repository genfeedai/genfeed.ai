'use client';

import { IngredientFormat } from '@genfeedai/contracts';
import type {
  IImage,
  IIngredient,
  IVideo,
} from '@genfeedai/contracts/interfaces';
import { Video } from '@genfeedai/models/ingredients/video.model';
import type { IngredientsMediaGridProps } from '@genfeedai/props/content/ingredient.props';
import { isVideoIngredient } from '@genfeedai/utils/media/ingredient-type.util';
import { CardEmptyContent } from '@ui/card/empty/CardEmpty';
import { Skeleton } from '@ui/display/skeleton/skeleton';
import {
  LazyMasonryImage,
  LazyMasonryVideo,
} from '@ui/lazy/masonry/LazyMasonry';
import { useMemo, useSyncExternalStore } from 'react';

import IngredientTimeGroupHeading from './ingredient-time-group-heading';
import { groupIngredientsByTime } from './ingredient-time-groups.util';

const COLUMN_GAP = '4px';

function getColumnsConfig(format?: IngredientFormat): {
  mobile: number;
  tablet: number;
  desktop: number;
} {
  if (format === IngredientFormat.LANDSCAPE) {
    return { desktop: 3, mobile: 2, tablet: 2 };
  }
  if (format === IngredientFormat.PORTRAIT) {
    return { desktop: 6, mobile: 3, tablet: 5 };
  }
  return { desktop: 5, mobile: 3, tablet: 4 };
}

function getViewportWidthSnapshot(): number {
  return typeof window === 'undefined' ? 0 : window.innerWidth;
}

function subscribeViewportWidth(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  window.addEventListener('resize', onStoreChange);
  return () => window.removeEventListener('resize', onStoreChange);
}

function useColumnCount(format?: IngredientFormat): number {
  const viewportWidth = useSyncExternalStore(
    subscribeViewportWidth,
    getViewportWidthSnapshot,
    () => 0,
  );

  return useMemo(() => {
    const config = getColumnsConfig(format);
    if (viewportWidth >= 1024) {
      return config.desktop;
    }
    if (viewportWidth >= 640) {
      return config.tablet;
    }
    return config.mobile;
  }, [format, viewportWidth]);
}

/**
 * CSS `column-count` fills each column top to bottom, so a newest-first list
 * reads down the first column before touching the second. Dealing items out
 * round-robin keeps the masonry look while the order reads left to right.
 */
function dealIntoColumns<T>(items: T[], columnCount: number): T[][] {
  const columns: T[][] = Array.from({ length: columnCount }, () => []);
  items.forEach((item, index) => {
    columns[index % columnCount].push(item);
  });
  return columns;
}

function IngredientsMediaGridSkeleton({
  columnCount,
}: {
  columnCount: number;
}) {
  return (
    <div style={{ columnCount, columnGap: COLUMN_GAP }}>
      {Array.from({ length: 12 }).map((_, index) => (
        <Skeleton
          // biome-ignore lint/suspicious/noArrayIndexKey: Fixed layout slots have positional identity and no item state.
          key={index}
          className="mb-1 aspect-[4/5] w-full break-inside-avoid rounded-card"
          variant="rounded"
        />
      ))}
    </div>
  );
}

export default function IngredientsMediaGrid({
  emptyLabel,
  emptyDescription,
  items,
  isLoading,
  isActionsEnabled,
  isDragEnabled,
  format,
  selectedIds,
  onDeleteIngredient,
  onMarkArchived,
  onConvertToPortrait,
  onGenerateCaptions,
  onReverse,
  onMirror,
  onSeeDetails,
  onUpdateParent,
  onRefresh,
  onPublishIngredient,
  onClickIngredient,
  onToggleSelection,
  isPortraiting,
  isGeneratingCaptions,
  isMirroring,
  isReversing,
  onScopeChange,
  onConvertToVideo,
  onCopyPrompt,
  onReprompt,
}: IngredientsMediaGridProps) {
  const columnCount = useColumnCount(format);

  if (isLoading) {
    return <IngredientsMediaGridSkeleton columnCount={columnCount} />;
  }

  if (items.length === 0) {
    return (
      <CardEmptyContent
        label={emptyLabel}
        description={emptyDescription}
        className="w-full"
      />
    );
  }

  const renderIngredient = (ingredient: IIngredient) => {
    const isSelected = selectedIds.includes(ingredient.id);

    if (isVideoIngredient(ingredient)) {
      return (
        <div
          key={ingredient.id}
          className="group relative mb-1 break-inside-avoid"
        >
          <LazyMasonryVideo
            video={new Video(ingredient as IVideo)}
            isSelected={isSelected}
            isActionsEnabled={isActionsEnabled}
            isDragEnabled={isDragEnabled}
            isGeneratingCaptions={isGeneratingCaptions}
            isPortraiting={isPortraiting}
            isMirroring={isMirroring}
            isReversing={isReversing}
            isContainerHovered={true}
            onDeleteIngredient={onDeleteIngredient}
            onPublishIngredient={onPublishIngredient}
            onCopyPrompt={onCopyPrompt}
            onReprompt={onReprompt}
            onMarkArchived={onMarkArchived}
            onSeeDetails={onSeeDetails}
            onReverse={onReverse}
            onMirror={onMirror}
            onUpdateParent={onUpdateParent}
            onRefresh={onRefresh}
            onClickIngredient={onClickIngredient}
            onToggleSelection={onToggleSelection}
            onScopeChange={onScopeChange}
            onPortraitVideo={onConvertToPortrait}
            onGenerateCaptions={onGenerateCaptions}
          />
        </div>
      );
    }

    return (
      <div
        key={ingredient.id}
        className="group relative mb-1 break-inside-avoid"
      >
        <LazyMasonryImage
          image={ingredient as IImage}
          isSelected={isSelected}
          isActionsEnabled={isActionsEnabled}
          isDragEnabled={isDragEnabled}
          isContainerHovered={true}
          onDeleteIngredient={onDeleteIngredient}
          onPublishIngredient={onPublishIngredient}
          onCopyPrompt={onCopyPrompt}
          onReprompt={onReprompt}
          onMarkArchived={onMarkArchived}
          onSeeDetails={onSeeDetails}
          onUpdateParent={onUpdateParent}
          onRefresh={onRefresh}
          onClickIngredient={onClickIngredient}
          onToggleSelection={onToggleSelection}
          onScopeChange={onScopeChange}
          onConvertToVideo={onConvertToVideo}
        />
      </div>
    );
  };

  const timeGroups = groupIngredientsByTime(items);

  const renderColumns = (columnItems: IIngredient[]) => (
    <div className="flex items-start" style={{ gap: COLUMN_GAP }}>
      {dealIntoColumns(columnItems, columnCount).map((column, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: Fixed layout slots have positional identity and no item state.
          key={index}
          className="flex min-w-0 flex-1 flex-col"
          data-masonry-column={index}
        >
          {column.map(renderIngredient)}
        </div>
      ))}
    </div>
  );

  if (!timeGroups) {
    return <div className="relative z-0">{renderColumns(items)}</div>;
  }

  return (
    <div className="relative z-0 flex flex-col gap-6">
      {timeGroups.map((group) => (
        <section key={group.label} className="flex flex-col gap-3">
          <IngredientTimeGroupHeading
            count={group.items.length}
            label={group.label}
          />
          {renderColumns(group.items)}
        </section>
      ))}
    </div>
  );
}
