'use client';

import { EMPTY_STATES } from '@genfeedai/constants';
import { useAssetSelection } from '@genfeedai/contexts/ui/asset-selection.context';
import {
  ButtonVariant,
  ComponentSize,
  categoryToString,
  formatEnumLabel,
  IngredientCategory,
  type IngredientFormat,
  ModalEnum,
  PageScope,
} from '@genfeedai/enums';
import type { IIngredient } from '@genfeedai/interfaces';
import type { IngredientsListContentProps } from '@genfeedai/props/pages/ingredients-list.props';
import {
  getIngredientFailureReason,
  getIngredientModelLabel,
  getIngredientProviderLabel,
  getIngredientSizeLabel,
} from '@genfeedai/utils/media/ingredient-ledger.util';
import { getIngredientPreviewUrl } from '@genfeedai/utils/media/ingredient-preview.util';
import {
  getIngredientDisplayLabel,
  isVideoIngredient,
} from '@genfeedai/utils/media/ingredient-type.util';
import { getLibraryAssetType } from '@genfeedai/utils/media/library-asset-type.util';
import { CardEmptyContent } from '@ui/card/empty/CardEmpty';
import Badge from '@ui/display/badge/Badge';
import { SkeletonList } from '@ui/display/skeleton/skeleton';
import AppTable from '@ui/display/table/Table';
import DropdownStatus from '@ui/dropdowns/status/DropdownStatus';
import LibraryAssetTypeBadge from '@ui/ingredients/library-asset-type-badge';
import IngredientsMediaGrid from '@ui/ingredients/list/media-grid/IngredientsMediaGrid';
import IngredientSound from '@ui/ingredients/sound/IngredientSound';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { format } from 'date-fns';
import { Eye, Film, ImageIcon } from 'lucide-react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo } from 'react';

// React Flow is heavier than the whole grid; only the canvas view pays for it.
const LibraryCanvas = dynamic(
  () => import('@ui/ingredients/canvas/LibraryCanvas'),
  {
    loading: () => <LazyLoadingFallback variant="minimal" />,
    ssr: false,
  },
);

function IngredientTablePreview({ ingredient }: { ingredient: IIngredient }) {
  const previewUrl = getIngredientPreviewUrl(ingredient);
  const label = getIngredientDisplayLabel(ingredient) || 'Asset preview';
  const isVideo = isVideoIngredient(ingredient);
  const assetType = getLibraryAssetType(ingredient.category);

  if (!previewUrl) {
    return (
      <div
        aria-label={label}
        className="flex size-10 items-center justify-center rounded-md bg-foreground/6 text-foreground/45"
        data-testid="ingredient-preview-fallback"
        role="img"
      >
        {isVideo || assetType?.id === 'video' ? (
          <Film className="size-4" />
        ) : (
          <ImageIcon className="size-4" />
        )}
      </div>
    );
  }

  return (
    <div className="relative size-10 overflow-hidden rounded-md bg-foreground/5">
      <Image
        alt={label}
        className="size-10 object-cover"
        height={40}
        sizes="40px"
        src={previewUrl}
        width={40}
      />
      {isVideo || assetType?.id === 'video' ? (
        <span
          className={
            'pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25' /* design-system-allow-content-color -- media overlay */
          }
        >
          <Film
            className={
              'size-3.5 text-white' /* design-system-allow-content-color -- media overlay */
            }
          />
        </span>
      ) : null}
    </div>
  );
}

/**
 * The list view is a ledger, so a row says what the asset is and — when the
 * generation failed — why. A red status chip with no reason forces the operator
 * back into the modal to find out what the provider actually said.
 */
function IngredientLedgerAssetCell({
  ingredient,
}: {
  ingredient: IIngredient;
}) {
  const label = getIngredientDisplayLabel(ingredient);
  const failureReason = getIngredientFailureReason(ingredient);
  const promptText = ingredient.promptText?.trim();

  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="truncate text-sm font-medium" title={label || undefined}>
        {label || 'Untitled asset'}
      </span>
      {failureReason ? (
        <span
          className="truncate text-xs text-destructive"
          data-testid={`ingredient-failure-reason-${ingredient.id}`}
          title={failureReason}
        >
          {failureReason}
        </span>
      ) : promptText ? (
        <span
          className="truncate text-xs text-foreground/45"
          title={promptText}
        >
          {promptText}
        </span>
      ) : null}
    </div>
  );
}

export default function IngredientsListContent({
  type,
  scope,
  singularType,
  viewMode,
  formatFilter,
  isLoading,
  filteredIngredients,
  hasFilteredEmptyState,
  selectedIngredientIds,
  isActionsEnabled,
  isDragEnabled,
  isPortraiting,
  isGeneratingCaptions,
  isMirroring,
  isReversing,
  onSelectionChange,
  onDeleteIngredient,
  onArchiveIngredient,
  onConvertToPortrait,
  onConvertToVideo,
  onGenerateCaptions,
  onReverse,
  onMirror,
  onSeeDetails,
  onUpdateParent,
  onRefresh,
  onPublishIngredient,
  onOpenIngredientModal,
  onOpenLightbox,
  onClearFilters,
  onSetIngredients,
  onScopeChange,
  onCopyPrompt,
  onReprompt,
}: IngredientsListContentProps) {
  const translate = useTranslations('pages.library');
  const isAudioCategory =
    singularType === IngredientCategory.MUSIC ||
    singularType === IngredientCategory.VOICE;

  const isMediaCategory =
    singularType === IngredientCategory.IMAGE ||
    singularType === IngredientCategory.VIDEO ||
    singularType === IngredientCategory.GIF;

  const { nonVisualIngredients, visualIngredients } = useMemo(() => {
    const visual: IIngredient[] = [];
    const nonVisual: IIngredient[] = [];

    for (const ingredient of filteredIngredients) {
      const assetType = getLibraryAssetType(ingredient.category)?.id;

      if (
        assetType === 'image' ||
        assetType === 'video' ||
        assetType === 'gif' ||
        assetType === 'avatar'
      ) {
        visual.push(ingredient);
      } else {
        nonVisual.push(ingredient);
      }
    }

    return { nonVisualIngredients: nonVisual, visualIngredients: visual };
  }, [filteredIngredients]);

  const columns = useMemo(
    () => [
      {
        className: 'w-14',
        header: '',
        key: 'ingredientUrl',
        render: (ingredient: IIngredient) => (
          <IngredientTablePreview ingredient={ingredient} />
        ),
      },
      {
        header: 'Asset',
        key: 'metadataLabel',
        render: (ingredient: IIngredient) => (
          <IngredientLedgerAssetCell ingredient={ingredient} />
        ),
      },
      {
        className: 'w-40',
        header: 'Type',
        key: 'category',
        render: (ingredient: IIngredient) => {
          const format =
            ingredient.ingredientFormat || ingredient.format || undefined;
          const formatLabel = formatEnumLabel(format);

          return (
            <div className="flex flex-wrap items-center gap-1.5">
              <LibraryAssetTypeBadge category={ingredient.category} />
              {formatLabel ? (
                <Badge size={ComponentSize.SM} variant="slate">
                  {formatLabel}
                </Badge>
              ) : null}
            </div>
          );
        },
      },
      {
        className: 'w-52',
        header: 'Model',
        key: 'model',
        render: (ingredient: IIngredient) => {
          const modelLabel = getIngredientModelLabel(ingredient);

          if (!modelLabel) {
            return <span className="text-foreground/35">—</span>;
          }

          const providerLabel = getIngredientProviderLabel(ingredient);

          return (
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm" title={modelLabel}>
                {modelLabel}
              </span>
              {providerLabel ? (
                <span className="truncate text-xs text-foreground/45">
                  {providerLabel}
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        className: 'w-28',
        header: 'Size',
        key: 'metadataSize',
        render: (ingredient: IIngredient) => {
          const sizeLabel = getIngredientSizeLabel(ingredient);

          if (!sizeLabel) {
            return <span className="text-foreground/35">—</span>;
          }

          return (
            <span className="text-sm tabular-nums text-foreground/70">
              {sizeLabel}
            </span>
          );
        },
      },
      {
        className: 'w-28',
        header: 'Created',
        key: 'createdAt',
        render: (ingredient: IIngredient) => {
          const createdAt = ingredient.createdAt
            ? new Date(ingredient.createdAt)
            : null;

          if (!createdAt || Number.isNaN(createdAt.getTime())) {
            return <span className="text-foreground/35">—</span>;
          }

          return (
            <time
              className="text-sm tabular-nums text-foreground/70"
              dateTime={createdAt.toISOString()}
            >
              {format(createdAt, 'd MMM yyyy')}
            </time>
          );
        },
      },
      {
        className: 'w-40',
        header: 'Status',
        key: 'status',
        render: (ingredient: IIngredient) => (
          <DropdownStatus
            entity={ingredient}
            onStatusChange={(_newStatus, updatedIngredient) => {
              if (updatedIngredient) {
                onSetIngredients((prev) =>
                  prev.map((ing: IIngredient) =>
                    ing.id === ingredient.id
                      ? (updatedIngredient as IIngredient)
                      : ing,
                  ),
                );
              }
            }}
          />
        ),
      },
    ],
    [onSetIngredients],
  );

  const handleMediaClick = useCallback(
    (ingredient: IIngredient) => {
      if (scope === PageScope.SUPERADMIN) {
        return;
      }

      const opened = onOpenLightbox(ingredient);

      if (!opened) {
        onOpenIngredientModal(ModalEnum.INGREDIENT, ingredient);
      }
    },
    [onOpenIngredientModal, onOpenLightbox, scope],
  );

  const handleToggleSelection = useCallback(
    (ingredient: IIngredient) => {
      onSelectionChange(
        selectedIngredientIds.includes(ingredient.id)
          ? selectedIngredientIds.filter((id) => id !== ingredient.id)
          : [...selectedIngredientIds, ingredient.id],
      );
    },
    [onSelectionChange, selectedIngredientIds],
  );

  const handleViewIngredient = useCallback(
    (ingredient: IIngredient) => {
      if (singularType === IngredientCategory.AVATAR) {
        onOpenIngredientModal(ModalEnum.INGREDIENT, ingredient);
        return;
      }

      if (scope === PageScope.ORGANIZATION && onOpenLightbox(ingredient)) {
        return;
      }

      onOpenIngredientModal(ModalEnum.INGREDIENT, ingredient);
    },
    [onOpenIngredientModal, onOpenLightbox, scope, singularType],
  );

  const tableActions = useMemo(
    () => [
      {
        icon: <Eye />,
        onClick: handleViewIngredient,
        tooltip: 'View',
      },
    ],
    [handleViewIngredient],
  );

  const content = useMemo(() => {
    if (viewMode === 'canvas') {
      // The canvas is a free-placement surface, so it needs a bounded box of
      // its own — the Library page scrolls, and `h-full` inside a scrolling
      // column collapses React Flow to zero height.
      return (
        <div className="h-[70vh] min-h-[32rem] overflow-hidden rounded-lg border border-border">
          <LibraryCanvas
            ingredients={filteredIngredients}
            isLoading={isLoading}
          />
        </div>
      );
    }

    if (viewMode === 'list') {
      return (
        <AppTable
          items={filteredIngredients}
          isLoading={isLoading}
          columns={columns}
          selectable
          selectedIds={selectedIngredientIds}
          onSelectionChange={onSelectionChange}
          getItemId={(ingredient: IIngredient) => ingredient.id}
          actions={tableActions}
        />
      );
    }

    if (isAudioCategory) {
      if (isLoading) {
        return <SkeletonList count={6} />;
      }

      // `IngredientSound` maps over its items and renders nothing at all for an
      // empty list, so an empty music or voice library used to be a blank pane.
      // Mirror the media grid and say so.
      if (filteredIngredients.length === 0) {
        return (
          <p className="text-sm text-foreground/45">{`No ${categoryToString(singularType)} yet`}</p>
        );
      }

      return (
        <IngredientSound
          ingredients={filteredIngredients}
          setIngredients={onSetIngredients}
        />
      );
    }

    if (isMediaCategory || viewMode === 'grid') {
      const mediaItems = isMediaCategory
        ? filteredIngredients
        : visualIngredients;

      return (
        <div className="flex flex-col gap-6">
          {mediaItems.length > 0 || nonVisualIngredients.length === 0 ? (
            <IngredientsMediaGrid
              emptyLabel={`No ${type === 'ingredients' ? 'assets' : type} yet`}
              items={mediaItems}
              onDeleteIngredient={onDeleteIngredient}
              onMarkArchived={onArchiveIngredient}
              onConvertToPortrait={onConvertToPortrait}
              onGenerateCaptions={onGenerateCaptions}
              onReverse={onReverse}
              onMirror={onMirror}
              onSeeDetails={onSeeDetails}
              onUpdateParent={onUpdateParent}
              onRefresh={onRefresh}
              selectedIds={selectedIngredientIds}
              isPortraiting={isPortraiting}
              isGeneratingCaptions={isGeneratingCaptions}
              isMirroring={isMirroring}
              isReversing={isReversing}
              isLoading={isLoading}
              isActionsEnabled={isActionsEnabled}
              isDragEnabled={isDragEnabled}
              format={
                formatFilter ? (formatFilter as IngredientFormat) : undefined
              }
              onPublishIngredient={onPublishIngredient}
              onClickIngredient={handleMediaClick}
              onToggleSelection={handleToggleSelection}
              onScopeChange={onScopeChange}
              onConvertToVideo={onConvertToVideo}
              onCopyPrompt={onCopyPrompt}
              onReprompt={onReprompt}
            />
          ) : null}

          {viewMode === 'grid' && nonVisualIngredients.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-2xs font-bold uppercase tracking-[0.15em] text-foreground/40">
                {translate('otherAssets')}
              </h3>
              <AppTable
                items={nonVisualIngredients}
                isLoading={false}
                columns={columns}
                selectable
                selectedIds={selectedIngredientIds}
                onSelectionChange={onSelectionChange}
                getItemId={(ingredient: IIngredient) => ingredient.id}
                actions={tableActions}
              />
            </section>
          ) : null}
        </div>
      );
    }

    return (
      <AppTable
        items={filteredIngredients}
        isLoading={isLoading}
        columns={columns}
        selectable
        selectedIds={selectedIngredientIds}
        onSelectionChange={onSelectionChange}
        getItemId={(ingredient: IIngredient) => ingredient.id}
        actions={tableActions}
      />
    );
  }, [
    columns,
    filteredIngredients,
    formatFilter,
    handleMediaClick,
    handleToggleSelection,
    isActionsEnabled,
    isDragEnabled,
    isAudioCategory,
    isGeneratingCaptions,
    isLoading,
    isMediaCategory,
    isMirroring,
    isPortraiting,
    isReversing,
    onArchiveIngredient,
    onConvertToPortrait,
    onConvertToVideo,
    onCopyPrompt,
    onGenerateCaptions,
    onMirror,
    onRefresh,
    onReprompt,
    onReverse,
    onScopeChange,
    onSeeDetails,
    onSelectionChange,
    onSetIngredients,
    onUpdateParent,
    onDeleteIngredient,
    onPublishIngredient,
    nonVisualIngredients,
    selectedIngredientIds,
    singularType,
    tableActions,
    translate,
    type,
    viewMode,
    visualIngredients,
  ]);

  /**
   * The workspace rail inspects one asset. A multi-selection is a bulk action,
   * so it publishes nothing rather than picking an arbitrary member to
   * describe.
   */
  const inspectedIngredient = useMemo(() => {
    if (selectedIngredientIds.length !== 1) {
      return null;
    }

    return (
      filteredIngredients.find(
        (ingredient: IIngredient) => ingredient.id === selectedIngredientIds[0],
      ) ?? null
    );
  }, [filteredIngredients, selectedIngredientIds]);

  /**
   * The grid owns the selection, the workspace shell owns the inspector.
   * Publishing into the shared asset selection is the whole handoff: the
   * library surface adapter reads it back and renders the inspector as a rail
   * pane, so the canvas never carries a second inspector of its own.
   */
  const { setSelectedAsset } = useAssetSelection();

  useEffect(() => {
    setSelectedAsset(inspectedIngredient);
  }, [inspectedIngredient, setSelectedAsset]);

  // Leaving the library drops the selection so the composer stops citing an
  // asset the operator can no longer see.
  useEffect(() => () => setSelectedAsset(null), [setSelectedAsset]);

  return (
    <div
      className={`flex-1 min-w-0 overflow-hidden ${
        isAudioCategory
          ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2'
          : ''
      }`}
    >
      {hasFilteredEmptyState ? (
        <CardEmptyContent
          label={EMPTY_STATES.RESULTS_FOUND}
          description="Try adjusting your filters or search terms."
          action={{
            label: 'Clear Filters',
            onClick: onClearFilters,
            variant: ButtonVariant.SECONDARY,
          }}
          className="w-full max-w-lg"
        />
      ) : (
        content
      )}
    </div>
  );
}
