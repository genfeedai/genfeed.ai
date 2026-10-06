'use client';

import { ButtonVariant, ComponentSize, PageScope } from '@genfeedai/contracts';
import type { IModel } from '@genfeedai/contracts/interfaces';
import type { ModelsListProps } from '@props/admin/models.props';
import type { TableAction } from '@props/ui/display/table.props';
import { EmptyState } from '@ui/card/EmptyState';
import AppTable from '@ui/display/table/Table';
import { LazyModalModel } from '@ui/lazy/modal/LazyModal';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import FormSearchbar from '@ui/primitives/searchbar';
import {
  CircleCheck,
  CircleX,
  Coins,
  Cpu,
  Info,
  MoreHorizontal,
  Trash2,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import AdminModelsFilters from './components/AdminModelsFilters';

import ModelsCatalogOverview from './components/ModelsCatalogOverview';
import { useModelsList } from './useModelsList';

export default function ModelsList({
  type,
  category,
  scope = PageScope.ORGANIZATION,
  onRefreshRegister,
  onPricingDetails,
  renderExpandedRow,
  renderToolbar,
}: ModelsListProps) {
  const translate = useTranslations('pages.models');
  const {
    isAdminScope,
    catalogOverviewCards,
    catalogTotal,
    handleCategorySelect,
    isLoadingCatalog,
    selectedGroupKey,
    isLoading,
    isError,
    columns,
    models,
    searchTerm,
    sortKey,
    sortDirection,
    selectedModel,
    setSelectedModel,
    refresh,
    handleViewDetails,
    handleDelete,
    handleApproveRegistryModel,
    handleRejectRegistryModel,
    handleSortChange,
    handleSearchChange,
    openConfirm,
  } = useModelsList({
    type,
    category,
    scope,
    onRefreshRegister,
  });

  // Actions - info button for all users, delete for admin only
  const actions: TableAction<IModel>[] = useMemo(
    () => [
      {
        icon: <Info />,
        onClick: handleViewDetails,
        tooltip: 'View Details',
      },
      ...(isAdminScope
        ? [
            {
              icon: <CircleCheck />,
              isVisible: (model: IModel) =>
                !!model.isDiscovered &&
                !model.isActive &&
                model.reviewStatus !== 'rejected',
              onClick: (model: IModel) => {
                openConfirm({
                  confirmLabel: 'Approve',
                  label: 'Approve Model',
                  message: `Approve "${model.label}" and make it available for generation?`,
                  onConfirm: () => handleApproveRegistryModel(model),
                });
              },
              tooltip: 'Approve',
            },
            {
              icon: <CircleX />,
              isVisible: (model: IModel) =>
                !!model.isDiscovered &&
                !model.isActive &&
                model.reviewStatus !== 'rejected',
              onClick: (model: IModel) => {
                openConfirm({
                  confirmLabel: 'Reject',
                  isError: true,
                  label: 'Reject Model',
                  message: `Reject "${model.label}" and keep it out of generation?`,
                  onConfirm: () => handleRejectRegistryModel(model),
                });
              },
              tooltip: 'Reject',
            },
            {
              icon: <Trash2 />,
              onClick: (model: IModel) => {
                setSelectedModel(model);
                openConfirm({
                  confirmLabel: 'Delete',
                  isError: true,
                  label: 'Delete Model',
                  message: `Are you sure you want to delete "${model.label}"? This action cannot be undone.`,
                  onConfirm: handleDelete,
                });
              },
              tooltip: 'Delete',
            },
          ]
        : []),
    ],
    [
      isAdminScope,
      handleViewDetails,
      openConfirm,
      handleDelete,
      handleApproveRegistryModel,
      handleRejectRegistryModel,
      setSelectedModel,
    ],
  );

  return (
    <>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            {translate('catalogTitle')}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {translate('catalogDescription')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdminScope ? <AdminModelsFilters category={category} /> : null}
          {renderToolbar?.(models)}
          <div className="w-full sm:w-64">
            <FormSearchbar
              className="w-full"
              onSearch={handleSearchChange}
              placeholder="Search models"
              size={ComponentSize.SM}
              value={searchTerm}
            />
          </div>
        </div>
      </div>

      {!isAdminScope ? (
        <ModelsCatalogOverview
          cards={catalogOverviewCards}
          isLoading={isLoadingCatalog}
          onSelect={isAdminScope ? undefined : handleCategorySelect}
          selectedKey={selectedGroupKey}
          total={catalogTotal}
        />
      ) : null}

      <AppTable<IModel>
        isLoading={isLoading}
        error={
          isError
            ? {
                title: translate('loadError'),
                onRetry: () => refresh(),
              }
            : undefined
        }
        columns={
          isAdminScope
            ? [
                ...columns,
                {
                  key: 'actions',
                  header: '',
                  render: (model: IModel) => (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant={ButtonVariant.GHOST}
                          size="icon"
                          aria-label={`More options for ${model.label}`}
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        {onPricingDetails ? (
                          <DropdownMenuItem
                            onSelect={() => onPricingDetails(model)}
                          >
                            <Coins />
                            Pricing details
                          </DropdownMenuItem>
                        ) : null}
                        {actions
                          .filter(
                            (action) =>
                              !action.isVisible || action.isVisible(model),
                          )
                          .map((action) => (
                            <DropdownMenuItem
                              key={
                                typeof action.tooltip === 'string'
                                  ? action.tooltip
                                  : action.tooltip(model)
                              }
                              onSelect={() => action.onClick?.(model)}
                            >
                              {typeof action.icon === 'function'
                                ? action.icon(model)
                                : action.icon}
                              {typeof action.tooltip === 'string'
                                ? action.tooltip
                                : action.tooltip(model)}
                            </DropdownMenuItem>
                          ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ),
                },
              ]
            : columns
        }
        actions={isAdminScope ? undefined : actions}
        renderExpandedRow={renderExpandedRow}
        onRowClick={handleViewDetails}
        getRowKey={(model: IModel) => model.id}
        emptyLabel="No models found"
        emptyState={
          <EmptyState
            title="No models found"
            description={
              searchTerm
                ? 'No models match your search. Clear it to see the catalog.'
                : 'No models are available for this filter. Change the filters or refresh the list.'
            }
            icon={Cpu}
            action={{
              label: searchTerm ? 'Clear search' : 'Refresh',
              onClick: () => {
                if (searchTerm) handleSearchChange('');
                else void refresh();
              },
              variant: ButtonVariant.SECONDARY,
            }}
          />
        }
        items={models}
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSortChange={handleSortChange}
      />

      {/* Model details modal - view mode for non-admin, edit mode for admin */}
      <LazyModalModel
        entity={selectedModel}
        mode={isAdminScope ? 'edit' : 'view'}
        onConfirm={() => {
          // Delay clearing to allow modal close animation to complete
          setTimeout(() => setSelectedModel(undefined), 150);
          refresh();
        }}
        onClose={() => {
          // Delay clearing to allow modal close animation to complete
          setTimeout(() => setSelectedModel(undefined), 150);
        }}
      />

      {!isLoading && (
        <div className="mt-4">
          <AutoPagination showTotal totalLabel="models" />
        </div>
      )}
    </>
  );
}
