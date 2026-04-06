'use client';

import {
  IngredientCategory,
  type IngredientFormat,
  ViewType,
} from '@genfeedai/enums';
import type { IIngredient } from '@genfeedai/interfaces';
import type { TableAction, TableColumn } from '@props/ui/display/table.props';
import AppTable from '@ui/display/table/Table';
import { LazyMasonryGrid } from '@ui/lazy/masonry/LazyMasonry';

interface AssetDisplayGridProps {
  viewMode: ViewType.MASONRY | ViewType.TABLE;
  supportsMasonry: boolean;
  isLoading: boolean;
  allAssets: IIngredient[];
  initialLoadComplete: boolean;
  selectedIngredientIds: string[];
  scrollFocusedIngredientId?: string | null;
  resolvedGridFormat: IngredientFormat | undefined;
  categoryType: IngredientCategory;
  columns: TableColumn<IIngredient>[];
  actions: TableAction<IIngredient>[];
  tableSelectedIds: string[];
  onTableSelectionChange: (ids: string[]) => void;
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
}

export function AssetDisplayGrid({
  viewMode,
  supportsMasonry,
  isLoading,
  allAssets,
  initialLoadComplete,
  selectedIngredientIds,
  scrollFocusedIngredientId,
  resolvedGridFormat,
  categoryType,
  columns,
  actions,
  tableSelectedIds,
  onTableSelectionChange,
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
}: AssetDisplayGridProps) {
  const isImageCategory = categoryType === IngredientCategory.IMAGE;

  if (supportsMasonry && viewMode === ViewType.MASONRY) {
    if (isLoading || allAssets.length > 0 || !initialLoadComplete) {
      return (
        <LazyMasonryGrid
          ingredients={allAssets}
          selectedIngredientId={selectedIngredientIds}
          scrollFocusedIngredientId={scrollFocusedIngredientId}
          highlightSelection={false}
          isActionsEnabled={true}
          isLoading={isLoading}
          isDragEnabled={false}
          format={resolvedGridFormat}
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
          onUseAsVideoReference={
            isImageCategory ? onUseAsVideoReference : undefined
          }
          onCreateVariation={isImageCategory ? onCreateVariation : undefined}
        />
      );
    }

    return (
      <div className="flex h-full items-center justify-center text-foreground/50">
        {emptyLabel}
      </div>
    );
  }

  return (
    <AppTable<IIngredient>
      items={allAssets}
      columns={columns}
      actions={actions}
      isLoading={isLoading}
      getRowKey={(item) => item.id}
      emptyLabel={emptyLabel}
      selectable={true}
      selectedIds={tableSelectedIds}
      onSelectionChange={onTableSelectionChange}
      getItemId={(item) => item.id}
    />
  );
}
