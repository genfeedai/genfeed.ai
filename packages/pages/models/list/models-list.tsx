'use client';

import { ButtonVariant, PageScope } from '@genfeedai/enums';
import type { IModel } from '@genfeedai/interfaces';
import type {
  IFilters,
  IFiltersState,
} from '@genfeedai/interfaces/utils/filters.interface';
import type { TableAction } from '@props/ui/display/table.props';
import { EmptyState } from '@ui/card/EmptyState';
import AppTable from '@ui/display/table/Table';
import { LazyModalModel } from '@ui/lazy/modal/LazyModal';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { CircleCheck, CircleX, Cpu, Info, Trash2 } from 'lucide-react';
import { useMemo } from 'react';

import ModelsAdminHeader from './components/ModelsAdminHeader';
import { useModelsList } from './useModelsList';

export default function ModelsList({
  type,
  category,
  scope = PageScope.ORGANIZATION,
  onRefreshRegister,
  filters,
}: {
  type?: string;
  category?: string;
  scope?: PageScope;
  onRefreshRegister?: (fn: (() => Promise<void>) | null) => void;
  filters?: IFiltersState;
  onFiltersChange?: (filters: IFiltersState, query: IFilters) => void;
}) {
  const {
    isAdminScope,
    defaultModelCards,
    isLoadingDefaults,
    isLoading,
    columns,
    filteredModels,
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
    openConfirm,
  } = useModelsList({
    type,
    category,
    scope,
    onRefreshRegister,
    filters,
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
      {isAdminScope && (
        <ModelsAdminHeader
          defaultModelCards={defaultModelCards}
          isLoadingDefaults={isLoadingDefaults}
        />
      )}

      <AppTable<IModel>
        isLoading={isLoading}
        columns={columns}
        actions={actions}
        onRowClick={handleViewDetails}
        getRowKey={(model: IModel) => model.id}
        emptyLabel="No models found"
        emptyState={
          <EmptyState
            title="No models found"
            description="No models are available for this filter. Try another tab or refresh the list."
            icon={Cpu}
            action={{
              label: 'Refresh',
              onClick: () => {
                void refresh();
              },
              variant: ButtonVariant.SECONDARY,
            }}
          />
        }
        items={filteredModels}
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
