'use client';

import {
  type IngredientCategory,
  type IngredientFormat,
  type IngredientStatus,
  ViewType,
} from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useDominantColor } from '@genfeedai/hooks/ui/use-dominant-color/use-dominant-color';
import type { IImage, IIngredient } from '@genfeedai/interfaces';
import type { CameraMovementPreset } from '@genfeedai/interfaces/studio/camera-movement.interface';
import { AssetDisplayGrid } from '@pages/studio/generate/components/AssetDisplayGrid';
import { GenerateEmptyState } from '@pages/studio/generate/components/GenerateEmptyState';
import { StoryboardPanel } from '@pages/studio/generate/components/StoryboardPanel';
import StudioSelectionActionsBar from '@pages/studio/selection/StudioSelectionActionsBar';
import type { TableAction, TableColumn } from '@props/ui/display/table.props';
import AmbientColorWash from '@ui/ambient/AmbientColorWash';
import InfiniteScroll from '@ui/feedback/infinite-scroll/InfiniteScroll';
import { type ReactNode, useMemo } from 'react';

interface GenerateContentAreaProps {
  // Category flags
  isVideoCategory: boolean;
  isEmptyStudioState: boolean;
  emptyComposer?: ReactNode;

  // Storyboard props (video only)
  cameraMovementPreset: CameraMovementPreset;
  customCameraPrompt: string;
  storyboardFormat: IngredientFormat;
  storyboardFrames: IImage[];
  hasInterpolationModel: boolean;
  isStoryboardGenerating: boolean;
  onCameraMovementPresetChange: (preset: CameraMovementPreset) => void;
  onClearStoryboard: () => void;
  onCustomCameraPromptChange: (prompt: string) => void;
  onStoryboardFramesChange: (frames: IImage[]) => void;
  onGenerateStoryboard: () => void;

  // Selection bar props
  viewMode: ViewType.MASONRY | ViewType.TABLE;
  tableSelectedIds: string[];
  onClearSelection: () => void;
  onBulkDelete: () => void;
  onBulkStatusChange: (status: IngredientStatus) => void;
  isBulkUpdating: boolean;

  // Infinite scroll props
  onLoadMore: () => Promise<void>;
  hasMore: boolean;
  isLoadingMore: boolean;
  isLoading: boolean;

  // Asset display grid props
  supportsMasonry: boolean;
  allAssets: IIngredient[];
  initialLoadComplete: boolean;
  selectedIngredientIds: string[];
  scrollFocusedAssetId: string | null;
  resolvedGridFormat: IngredientFormat | undefined;
  categoryType: IngredientCategory;
  columns: TableColumn<IIngredient>[];
  actions: TableAction<IIngredient>[];
  emptyLabel: string;
  onRefresh: () => Promise<void>;
  onClickIngredient: (ingredient: IIngredient) => void;
  onToggleFavorite: (item: IIngredient) => Promise<void>;
  onCopyPrompt: (item: IIngredient) => void;
  onReprompt: (ingredient: IIngredient) => Promise<void>;
  onEditIngredient: (ingredient: IIngredient) => void;
  onMarkValidated: (item: IIngredient) => Promise<void>;
  onMarkRejected: (item: IIngredient) => Promise<void>;
  onMarkArchived: (item: IIngredient) => Promise<void>;
  onSeeDetails: (ingredient: IIngredient) => void;
  onPublishIngredient: (ingredient: IIngredient) => void;
  onUseAsVideoReference?: (ingredient: IIngredient) => void;
  onCreateVariation?: (ingredient: IIngredient) => void;
  onTableSelectionChange: (ids: string[]) => void;
}

export function GenerateContentArea({
  isVideoCategory,
  isEmptyStudioState,
  emptyComposer,
  cameraMovementPreset,
  customCameraPrompt,
  storyboardFormat,
  storyboardFrames,
  hasInterpolationModel,
  isStoryboardGenerating,
  onCameraMovementPresetChange,
  onClearStoryboard,
  onCustomCameraPromptChange,
  onStoryboardFramesChange,
  onGenerateStoryboard,
  viewMode,
  tableSelectedIds,
  onClearSelection,
  onBulkDelete,
  onBulkStatusChange,
  isBulkUpdating,
  onLoadMore,
  hasMore,
  isLoadingMore,
  isLoading,
  supportsMasonry,
  allAssets,
  initialLoadComplete,
  selectedIngredientIds,
  scrollFocusedAssetId,
  resolvedGridFormat,
  categoryType,
  columns,
  actions,
  emptyLabel,
  onRefresh,
  onClickIngredient,
  onToggleFavorite,
  onCopyPrompt,
  onReprompt,
  onEditIngredient,
  onMarkValidated,
  onMarkRejected,
  onMarkArchived,
  onSeeDetails,
  onPublishIngredient,
  onUseAsVideoReference,
  onCreateVariation,
  onTableSelectionChange,
}: GenerateContentAreaProps) {
  // Ambient wash derives from the media the user is focused on — the scroll-
  // focused asset, else the first selection, else the newest result. When the
  // studio is empty there is no focus, so the wash disables gracefully.
  const focusedAsset = useMemo<IIngredient | undefined>(() => {
    if (scrollFocusedAssetId) {
      const focused = allAssets.find(
        (asset) => asset.id === scrollFocusedAssetId,
      );
      if (focused) {
        return focused;
      }
    }
    const firstSelectedId = selectedIngredientIds[0];
    if (firstSelectedId) {
      const selected = allAssets.find((asset) => asset.id === firstSelectedId);
      if (selected) {
        return selected;
      }
    }
    return allAssets[0];
  }, [allAssets, scrollFocusedAssetId, selectedIngredientIds]);

  const ambientColor = useDominantColor(
    focusedAsset?.ingredientUrl ?? focusedAsset?.thumbnailUrl,
  );

  return (
    <div className="flex flex-1 overflow-hidden relative w-full">
      <AmbientColorWash color={ambientColor?.rgb ?? null} />
      <div className="relative z-[1] flex flex-1 flex-col overflow-hidden">
        <div
          className={cn(
            'flex-1 overflow-auto px-6 pt-6',
            isEmptyStudioState ? 'pb-6' : 'pb-40 md:pb-40',
          )}
        >
          {isVideoCategory && (
            <StoryboardPanel
              cameraMovementPreset={cameraMovementPreset}
              customCameraPrompt={customCameraPrompt}
              format={storyboardFormat}
              frames={storyboardFrames}
              hasInterpolationModel={hasInterpolationModel}
              isGenerating={isStoryboardGenerating}
              onCameraMovementPresetChange={onCameraMovementPresetChange}
              onClear={onClearStoryboard}
              onCustomCameraPromptChange={onCustomCameraPromptChange}
              onFramesChange={onStoryboardFramesChange}
              onGenerate={onGenerateStoryboard}
            />
          )}

          {viewMode === ViewType.TABLE && tableSelectedIds.length > 0 && (
            <StudioSelectionActionsBar
              count={tableSelectedIds.length}
              onClear={onClearSelection}
              onBulkDelete={onBulkDelete}
              onBulkStatusChange={onBulkStatusChange}
              isBulkUpdating={isBulkUpdating}
            />
          )}

          {isEmptyStudioState ? (
            <div className="flex min-h-full flex-col items-center justify-center py-8">
              <GenerateEmptyState />
              {emptyComposer ? (
                <div className="w-full max-w-4xl">{emptyComposer}</div>
              ) : null}
            </div>
          ) : (
            <InfiniteScroll
              onLoadMore={onLoadMore}
              hasMore={hasMore}
              isLoading={isLoadingMore}
              enabled={!isLoading}
            >
              <AssetDisplayGrid
                viewMode={viewMode}
                supportsMasonry={supportsMasonry}
                isLoading={isLoading}
                allAssets={allAssets}
                initialLoadComplete={initialLoadComplete}
                selectedIngredientIds={selectedIngredientIds}
                scrollFocusedIngredientId={scrollFocusedAssetId}
                resolvedGridFormat={resolvedGridFormat}
                categoryType={categoryType}
                columns={columns}
                actions={actions}
                tableSelectedIds={tableSelectedIds}
                onTableSelectionChange={onTableSelectionChange}
                emptyLabel={emptyLabel}
                onRefresh={onRefresh}
                onClickIngredient={onClickIngredient}
                onToggleFavorite={onToggleFavorite}
                onCopyPrompt={onCopyPrompt}
                onReprompt={onReprompt}
                onEditIngredient={onEditIngredient}
                onMarkValidated={onMarkValidated}
                onMarkRejected={onMarkRejected}
                onMarkArchived={onMarkArchived}
                onSeeDetails={onSeeDetails}
                onPublishIngredient={onPublishIngredient}
                onUseAsVideoReference={onUseAsVideoReference}
                onCreateVariation={onCreateVariation}
              />
            </InfiniteScroll>
          )}
        </div>
      </div>
    </div>
  );
}
