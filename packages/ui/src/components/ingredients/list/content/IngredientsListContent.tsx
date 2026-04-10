'use client';

import { EMPTY_STATES } from '@genfeedai/constants';
import {
  ButtonVariant,
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
import IngredientsMediaGrid from '@ui/ingredients/list/media-grid/IngredientsMediaGrid';
import IngredientSound from '@ui/ingredients/sound/IngredientSound';
import Image from 'next/image';
import { useCallback, useMemo } from 'react';
import { HiEye } from 'react-icons/hi2';

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
            {ingredient.category}
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
        icon: <HiEye />,
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
            variant: ButtonVariant.OUTLINE,
          }}
          className="w-full max-w-lg"
        />
      ) : (
        content
      )}
    </div>
  );
}
