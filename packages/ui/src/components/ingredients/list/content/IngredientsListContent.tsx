'use client';

import { EMPTY_STATES } from '@genfeedai/constants';
import {
  ButtonVariant,
  formatEnumLabel,
  IngredientCategory,
  type IngredientFormat,
  ModalEnum,
  PageScope,
} from '@genfeedai/enums';
import type { IIngredient } from '@genfeedai/interfaces';
import type { IngredientsListContentProps } from '@genfeedai/props/pages/ingredients-list.props';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { getIngredientDisplayLabel } from '@genfeedai/utils/media/ingredient-type.util';
import { CardEmptyContent } from '@ui/card/empty/CardEmpty';
import Badge from '@ui/display/badge/Badge';
import { SkeletonList } from '@ui/display/skeleton/skeleton';
import AppTable from '@ui/display/table/Table';
import DropdownStatus from '@ui/dropdowns/status/DropdownStatus';
import IngredientInspectorRail from '@ui/ingredients/inspector/IngredientInspectorRail';
import {
  getIsInspectorDocked,
  subscribeInspectorDocked,
} from '@ui/ingredients/inspector/inspector-viewport.util';
import IngredientsMediaGrid from '@ui/ingredients/list/media-grid/IngredientsMediaGrid';
import IngredientSound from '@ui/ingredients/sound/IngredientSound';
import ContextInspector from '@ui/overlays/context-inspector/ContextInspector';
import { Eye } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useMemo, useSyncExternalStore } from 'react';

export default function IngredientsListContent({
  type,
  scope,
  singularType,
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
  const isAudioCategory =
    singularType === IngredientCategory.MUSIC ||
    singularType === IngredientCategory.VOICE;

  const isMediaCategory =
    singularType === IngredientCategory.IMAGE ||
    singularType === IngredientCategory.VIDEO ||
    singularType === IngredientCategory.GIF;

  const columns = useMemo(
    () => [
      {
        header: '',
        key: 'ingredientUrl',
        render: (ingredient: IIngredient) => (
          <Image
            src={
              ingredient.ingredientUrl ||
              `${EnvironmentService.assetsEndpoint}/placeholders/portrait.jpg`
            }
            alt="Ingredient URL"
            width={20}
            height={20}
            sizes="20px"
          />
        ),
      },
      {
        header: 'Label',
        key: 'metadataLabel',
        render: (ingredient: IIngredient) =>
          getIngredientDisplayLabel(ingredient),
      },
      {
        header: 'Category',
        key: 'category',
        render: (ingredient: IIngredient) => (
          <Badge variant="outline" className="uppercase">
            {formatEnumLabel(ingredient.category)}
          </Badge>
        ),
      },
      { header: 'Format', key: 'ingredientFormat' },
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
      if (scope === PageScope.SUPERADMIN || scope === PageScope.ORGANIZATION) {
        return;
      }

      const opened = onOpenLightbox(ingredient);

      if (!opened) {
        onOpenIngredientModal(ModalEnum.INGREDIENT, ingredient);
      }
    },
    [onOpenIngredientModal, onOpenLightbox, scope],
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
    if (isAudioCategory) {
      if (isLoading) {
        return <SkeletonList count={6} />;
      }

      return (
        <IngredientSound
          ingredients={filteredIngredients}
          setIngredients={onSetIngredients}
        />
      );
    }

    if (isMediaCategory) {
      return (
        <IngredientsMediaGrid
          emptyLabel={`No ${type} yet`}
          items={filteredIngredients}
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
          format={formatFilter ? (formatFilter as IngredientFormat) : undefined}
          onPublishIngredient={onPublishIngredient}
          onClickIngredient={handleMediaClick}
          onScopeChange={onScopeChange}
          onConvertToVideo={onConvertToVideo}
          onCopyPrompt={onCopyPrompt}
          onReprompt={onReprompt}
        />
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
    selectedIngredientIds,
    tableActions,
    type,
  ]);

  /**
   * The rail inspects one asset. A multi-selection is a bulk action, so it
   * stays closed rather than picking an arbitrary member to describe.
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
   * Dock the inspector beside the grid where there is room for both, and show
   * the same rail as a sheet where there is not. A docked rail that is merely
   * hidden below `lg` leaves a narrow viewport with no way to read the asset it
   * just selected.
   */
  const isInspectorDocked = useSyncExternalStore(
    subscribeInspectorDocked,
    getIsInspectorDocked,
    () => false,
  );

  /** Closing the inspector is the same gesture as dropping the selection. */
  const handleInspectorOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        onSelectionChange([]);
      }
    },
    [onSelectionChange],
  );

  return (
    <div className="flex min-w-0 flex-1 overflow-hidden">
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

      {inspectedIngredient && isInspectorDocked ? (
        <IngredientInspectorRail ingredient={inspectedIngredient} />
      ) : null}

      {inspectedIngredient && !isInspectorDocked ? (
        <ContextInspector
          isOpen
          onOpenChange={handleInspectorOpenChange}
          title={inspectedIngredient.metadataLabel || 'Untitled asset'}
          width="md"
        >
          <IngredientInspectorRail
            className="w-full border-l-0 px-5 py-5"
            hasHeading={false}
            ingredient={inspectedIngredient}
          />
        </ContextInspector>
      ) : null}
    </div>
  );
}
