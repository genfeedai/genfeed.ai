'use client';
import type {
  IImage,
  IIngredient,
  IVideo,
} from '@genfeedai/contracts/interfaces';
import { Video } from '@genfeedai/models/ingredients/video.model';
import { isVideoIngredient } from '@genfeedai/utils/media/ingredient-type.util';
import OrderedMasonry from '@ui/display/masonry/OrderedMasonry';
import { Skeleton } from '@ui/display/skeleton/skeleton';
import {
  LazyMasonryImage,
  LazyMasonryVideo,
} from '@ui/lazy/masonry/LazyMasonry';
import { EmptyState } from '@ui/primitives/empty-state';
import IngredientTileOverlays from '@/components/ingredients/ingredient-tile-overlays';
import type { IngredientsMediaGridProps } from '@/props/content/ingredient.props';
import IngredientTimeGroupHeading from './ingredient-time-group-heading';
import { groupIngredientsByTime } from './ingredient-time-groups.util';

const NOOP = () => {};

function IngredientsMediaGridSkeleton() {
  return (
    <OrderedMasonry>
      {Array.from({ length: 12 }).map((_, index) => (
        <Skeleton
          // biome-ignore lint/suspicious/noArrayIndexKey: Fixed loading slots have positional identity.
          key={index}
          className="aspect-[4/5] w-full rounded-card"
          variant="rounded"
        />
      ))}
    </OrderedMasonry>
  );
}

export default function IngredientsMediaGrid({
  emptyLabel = '',
  emptyActions,
  items,
  isLoading,
  isActionsEnabled = false,
  isDragEnabled = false,
  isTimeGroupingEnabled = true,
  selectedIds = [],
  onDeleteIngredient,
  onMarkArchived,
  onConvertToPortrait,
  onGenerateCaptions,
  onReverse,
  onMirror,
  onSeeDetails,
  onUpdateParent,
  onRefresh,
  onReviewUpdated,
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
  if (isLoading) {
    return <IngredientsMediaGridSkeleton />;
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title={emptyLabel}
        actions={emptyActions}
        className="w-full"
      />
    );
  }

  const reviewHandler = onReviewUpdated ?? onRefresh;
  const isReviewEnabled = isActionsEnabled && Boolean(reviewHandler);

  const renderIngredient = (ingredient: IIngredient) => {
    const isSelected = selectedIds.includes(ingredient.id);

    if (isVideoIngredient(ingredient)) {
      return (
        <div key={ingredient.id} className="group relative">
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
          <IngredientTileOverlays
            ingredient={ingredient}
            isReviewEnabled={isReviewEnabled}
            onReviewUpdated={reviewHandler ?? NOOP}
          />
        </div>
      );
    }

    return (
      <div key={ingredient.id} className="group relative">
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
        <IngredientTileOverlays
          ingredient={ingredient}
          isReviewEnabled={isReviewEnabled}
          onReviewUpdated={reviewHandler ?? NOOP}
        />
      </div>
    );
  };

  const timeGroups = isTimeGroupingEnabled
    ? groupIngredientsByTime(items)
    : null;

  const renderMasonry = (columnItems: IIngredient[]) => (
    <OrderedMasonry>{columnItems.map(renderIngredient)}</OrderedMasonry>
  );

  if (!timeGroups) {
    return <div className="relative z-0">{renderMasonry(items)}</div>;
  }

  return (
    <div className="relative z-0 flex flex-col gap-6">
      {timeGroups.map((group) => (
        <section
          key={group.label}
          // The page body pads its top edge (py-5 / sm:py-6) so a plain grid
          // clears the topbar. The first group heading docks on that topbar
          // anyway, so it climbs back over the padding instead of leaving a
          // dead band above it before the first scroll.
          className="flex flex-col gap-3 first:-mt-5 sm:first:-mt-6"
        >
          <IngredientTimeGroupHeading
            count={group.items.length}
            label={group.label}
          />
          {renderMasonry(group.items)}
        </section>
      ))}
    </div>
  );
}
