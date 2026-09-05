'use client';

import { ButtonVariant, ComponentSize, PageScope } from '@genfeedai/contracts';
import type { IModel } from '@genfeedai/contracts/interfaces';
import type { TableAction } from '@props/ui/display/table.props';
import { EmptyState } from '@ui/card/EmptyState';
import AppTable from '@ui/display/table/Table';
import { LazyModalModel } from '@ui/lazy/modal/LazyModal';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import FormSearchbar from '@ui/primitives/searchbar';
import { CircleCheck, CircleX, Cpu, Info, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ChangeEvent, useMemo } from 'react';

import ModelsCatalogOverview from './components/ModelsCatalogOverview';
import { useModelsList } from './useModelsList';

export default function ModelsList({
  type,
  category,
  scope = PageScope.ORGANIZATION,
  onRefreshRegister,
}: {
  type?: string;
  category?: string;
  scope?: PageScope;
  onRefreshRegister?: (fn: (() => Promise<void>) | null) => void;
}) {
  const translate = useTranslations('pages.models');
  const {
    isAdminScope,
    catalogOverviewCards,
    isLoadingCatalog,
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
        <div className="w-full sm:w-64">
          <FormSearchbar
            className="w-full"
            inputClassName="h-8 rounded-md border-border bg-card text-foreground focus:border-border-strong focus:outline-none"
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              handleSearchChange(event.target.value)
            }
            onClear={() => handleSearchChange('')}
            placeholder="Search models"
            size={ComponentSize.SM}
            value={searchTerm}
          />
        </div>
      </div>

      <ModelsCatalogOverview
        cards={catalogOverviewCards}
        isLoading={isLoadingCatalog}
      />

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
        columns={columns}
        actions={actions}
        onRowClick={handleViewDetails}
        getRowKey={(model: IModel) => model.id}
        emptyLabel="No models found"
        emptyState={
          <EmptyState
            title="No models found"
            description={
              searchTerm
                ? 'No models match your search. Clear it to see the catalog.'
                : 'No models are available for this filter. Try another tab or refresh the list.'
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
