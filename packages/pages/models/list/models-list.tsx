'use client';

import { PageScope } from '@genfeedai/enums';
import type { IModel } from '@genfeedai/interfaces';
import type {
  IFilters,
  IFiltersState,
} from '@genfeedai/interfaces/utils/filters.interface';
import type { TableAction } from '@props/ui/display/table.props';
import AppTable from '@ui/display/table/Table';
import { LazyModalModel } from '@ui/lazy/modal/LazyModal';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { useMemo } from 'react';
import { HiInformationCircle, HiTrash } from 'react-icons/hi2';
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
    adminOrg,
    adminBrand,
    handleAdminOrgChange,
    handleAdminBrandChange,
    defaultModelCards,
    isLoadingDefaults,
    isLoading,
    columns,
    filteredModels,
    selectedModel,
    setSelectedModel,
    refresh,
    handleViewDetails,
    handleDelete,
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
        icon: <HiInformationCircle />,
        onClick: handleViewDetails,
        tooltip: 'View Details',
      },
      ...(isAdminScope
        ? [
            {
              icon: <HiTrash />,
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
      setSelectedModel,
    ],
  );

  return (
    <>
      {isAdminScope && (
        <ModelsAdminHeader
          organization={adminOrg}
          brand={adminBrand}
          onOrganizationChange={handleAdminOrgChange}
          onBrandChange={handleAdminBrandChange}
          defaultModelCards={defaultModelCards}
          isLoadingDefaults={isLoadingDefaults}
        />
      )}

      <AppTable<IModel>
        isLoading={isLoading}
        columns={columns}
        actions={actions}
        getRowKey={(model: IModel) => model.id}
        emptyLabel="No models found"
        items={filteredModels}
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
