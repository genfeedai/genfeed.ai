'use client';

import { ButtonVariant, ComponentSize, PageScope } from '@genfeedai/contracts';
import type { IModel } from '@genfeedai/contracts/interfaces';
import type { ModelsListProps } from '@props/admin/models.props';
import type {
  TableAction,
  TableRowSidebar,
} from '@props/ui/display/table.props';
import { EmptyState } from '@ui/card/EmptyState';
import AppTable from '@ui/display/table/Table';
import { LazyModalModel } from '@ui/lazy/modal/LazyModal';
import ModelDetailPanel from '@ui/models/ModelDetailPanel';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import FormSearchbar from '@ui/primitives/searchbar';
import { CircleCheck, CircleX, Cpu, Pencil, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import AdminModelsToolbar from './components/AdminModelsToolbar';

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
  rowActions,
  isModelPinned,
  beforeList,
  onRefresh,
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
    onRefresh,
    isModelPinned,
  });

  const [isRefreshing, setIsRefreshing] = useState(false);
  async function handleRefresh() {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await refresh();
    } finally {
      setIsRefreshing(false);
    }
  }

  // One way to see a model's details: outside the admin a row click opens
  // them in the right sidebar. In the admin a row click expands pricing inline
  // when the page supplies it (the pencil opens the editor), else it opens the
  // editor directly.
  const isPricingInline = isAdminScope && Boolean(onPricingDetails);
  const handleRowClick =
    isPricingInline && onPricingDetails ? onPricingDetails : handleViewDetails;
  const rowSidebar = useMemo<TableRowSidebar<IModel>>(
    () => ({
      getId: (model) => model.id,
      getSubtitle: (model) => model.key,
      getTitle: (model) => model.label,
      kind: 'model',
      render: (model) => <ModelDetailPanel model={model} />,
    }),
    [],
  );
  const actions: TableAction<IModel>[] = useMemo(
    () => [
      ...(isAdminScope
        ? [
            ...(rowActions ?? []),
            {
              icon: <Pencil />,
              onClick: handleViewDetails,
              tooltip: translate('editModel'),
            },
            {
              icon: <CircleCheck />,
              isVisible: (model: IModel) =>
                !!model.isDiscovered &&
                !model.isActive &&
                model.reviewStatus !== 'rejected',
              onClick: (model: IModel) => {
                openConfirm({
                  confirmLabel: translate('approve'),
                  label: translate('approveModel'),
                  message: translate('approveConfirmation', {
                    label: model.label,
                  }),
                  onConfirm: () => handleApproveRegistryModel(model),
                });
              },
              tooltip: translate('approve'),
            },
            {
              icon: <CircleX />,
              isVisible: (model: IModel) =>
                !!model.isDiscovered &&
                !model.isActive &&
                model.reviewStatus !== 'rejected',
              onClick: (model: IModel) => {
                openConfirm({
                  confirmLabel: translate('reject'),
                  isError: true,
                  label: translate('rejectModel'),
                  message: translate('rejectConfirmation', {
                    label: model.label,
                  }),
                  onConfirm: () => handleRejectRegistryModel(model),
                });
              },
              tooltip: translate('reject'),
            },
            {
              icon: <Trash2 />,
              onClick: (model: IModel) => {
                setSelectedModel(model);
                openConfirm({
                  confirmLabel: translate('delete'),
                  isError: true,
                  label: translate('deleteModel'),
                  message: translate('deleteConfirmation', {
                    label: model.label,
                  }),
                  onConfirm: handleDelete,
                });
              },
              tooltip: translate('delete'),
            },
          ]
        : []),
    ],
    [
      isAdminScope,
      rowActions,
      translate,
      handleViewDetails,
      openConfirm,
      handleDelete,
      handleApproveRegistryModel,
      handleRejectRegistryModel,
      setSelectedModel,
    ],
  );

  const content = (
    <>
      {beforeList}
      {!isAdminScope ? (
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
            {renderToolbar?.(models)}
            <div className="w-full sm:w-64">
              <FormSearchbar
                className="w-full"
                onSearch={handleSearchChange}
                placeholder={translate('searchModels')}
                size={ComponentSize.SM}
                value={searchTerm}
              />
            </div>
          </div>
        </div>
      ) : null}

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
        columns={columns}
        actions={actions}
        renderExpandedRow={renderExpandedRow}
        onRowClick={isAdminScope ? handleRowClick : undefined}
        rowSidebar={isAdminScope ? undefined : rowSidebar}
        getRowKey={(model: IModel) => model.id}
        emptyLabel={translate('noModelsFound')}
        emptyState={
          <EmptyState
            title={translate('noModelsFound')}
            description={
              searchTerm
                ? translate('emptySearchHint')
                : translate('emptyFilterHint')
            }
            icon={Cpu}
            action={{
              label: searchTerm
                ? translate('clearSearch')
                : translate('refresh'),
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

      {/* Model editor: admin only. Everyone else reads a model in the sidebar. */}
      {isAdminScope ? (
        <LazyModalModel
          entity={selectedModel}
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
      ) : null}

      {!isLoading && (
        <div className="mt-4">
          <AutoPagination showTotal totalLabel="models" />
        </div>
      )}
    </>
  );

  if (!isAdminScope) return content;
  return (
    <AdminModelsToolbar
      category={category}
      iconActions={renderToolbar?.(models)}
      isRefreshing={isRefreshing}
      onRefresh={() => void handleRefresh()}
      onSearch={handleSearchChange}
      searchTerm={searchTerm}
    >
      {content}
    </AdminModelsToolbar>
  );
}
