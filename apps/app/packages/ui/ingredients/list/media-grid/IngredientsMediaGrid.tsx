'use client';

import type { IImage, IIngredient, IVideo } from '@genfeedai/interfaces';
import { IngredientFormat } from '@genfeedai/enums';
import { Video } from '@models/ingredients/video.model';
import type { IngredientsMediaGridProps } from '@props/content/ingredient.props';
import { Skeleton } from '@ui/display/skeleton/skeleton';
import {
  LazyMasonryImage,
  LazyMasonryVideo,
} from '@ui/lazy/masonry/LazyMasonry';
import { isVideoIngredient } from '@utils/media/ingredient-type.util';

function getGridClassName(format?: IngredientFormat): string {
  switch (format) {
    case IngredientFormat.LANDSCAPE:
      return 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3';
    case IngredientFormat.PORTRAIT:
      return 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4';
    default:
      return 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4';
  }
}

function IngredientsMediaGridSkeleton({
  format,
}: {
  format?: IngredientFormat;
}) {
  return (
    <div className={`grid gap-3 ${getGridClassName(format)}`}>
      {Array.from({ length: 12 }).map((_, index) => (
        <Skeleton
          key={index}
          className="aspect-[4/5] w-full rounded-lg"
          variant="rounded"
        />
      ))}
    </div>
  );
}

export default function IngredientsMediaGrid({
  emptyLabel,
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
  isPortraiting,
  isGeneratingCaptions,
  isMirroring,
  isReversing,
  onScopeChange,
  onConvertToVideo,
  onCopyPrompt,
  onReprompt,
}: IngredientsMediaGridProps) {
  if (isLoading) {
    return <IngredientsMediaGridSkeleton format={format} />;
  }

  if (items.length === 0) {
    return <p className="text-sm text-foreground/45">{emptyLabel}</p>;
  }

  return (
    <div className={`grid gap-3 ${getGridClassName(format)}`}>
      {items.map((ingredient: IIngredient) => {
        const isSelected = selectedIds.includes(ingredient.id);

        if (isVideoIngredient(ingredient)) {
          return (
            <div key={ingredient.id} className="min-w-0">
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
                onScopeChange={onScopeChange}
                onPortraitVideo={onConvertToPortrait}
                onGenerateCaptions={onGenerateCaptions}
              />
            </div>
          );
        }

        return (
          <div key={ingredient.id} className="min-w-0">
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
              onScopeChange={onScopeChange}
              onConvertToVideo={onConvertToVideo}
            />
          </div>
        );
      })}
    </div>
  );
}
