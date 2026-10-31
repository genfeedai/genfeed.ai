'use client';

import {
  type ModelsToolbar,
  usePublishModelsToolbar,
} from '@contexts/models/models-toolbar-context/models-toolbar-context';
import { ButtonVariant, PageScope } from '@genfeedai/contracts';
import type { IModel } from '@genfeedai/contracts/interfaces';
import type {
  TableAction,
  TableRowSidebar,
} from '@props/ui/display/table.props';
import { EmptyState } from '@ui/card/EmptyState';
import AppTable from '@ui/display/table/Table';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { CircleCheck, CircleX, Cpu, Pencil, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { LazyModalModel } from '@/components/lazy/modal/LazyModal';
import ModelDetailPanel from '@/features/models/components/models/ModelDetailPanel';
import type { ModelsListProps } from '@/features/models/props/models.props';
import AdminModelsToolbar from './components/AdminModelsToolbar';
import type { ModelCategoryGroupKey } from './components/models-catalog-overview.helpers';

import { useModelsList } from './useModelsList';

export default function ModelsList({
  type,
  category,
  scope = PageScope.ORGANIZATION,
  onRefreshRegister,
  onPricingDetails,
  getModelHref,
  renderExpandedRow,
  renderToolbar,
  rowActions,
  isModelPinned,
  beforeList,
  onRefresh,
}: ModelsListProps) {
  const translate = useTranslations('pages.models');
  const router = useRouter();
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

  const openModel = useCallback(
    (model: IModel) => {
      if (getModelHref) router.push(getModelHref(model));
      else handleViewDetails(model);
    },
    [getModelHref, router, handleViewDetails],
  );

  // Outside the admin the search and the category filter live in the
  // settings layout's subbar: the Filters menu sits inside the search field.
  const search = useMemo(
    () => ({
      onSearch: handleSearchChange,
      placeholder: translate('searchModels'),
      value: searchTerm,
    }),
    [handleSearchChange, searchTerm, translate],
  );
  const modelsToolbar = useMemo<ModelsToolbar | null>(
    () =>
      isAdminScope
        ? null
        : {
            facets: [
              {
                defaultValue: 'all',
                key: 'category',
                label: translate('categoryFilterLabel'),
                onChange: (value: string) =>
                  handleCategorySelect(
                    value === 'all' ? 'all' : (value as ModelCategoryGroupKey),
                  ),
                options: [
                  {
                    count: isLoadingCatalog ? undefined : catalogTotal,
                    label: translate('categoryAll'),
                    value: 'all',
                  },
                  ...catalogOverviewCards.map((card) => ({
                    count: isLoadingCatalog ? undefined : card.count,
                    label: card.label,
                    value: card.key,
                  })),
                ],
                selection: 'single' as const,
                value: selectedGroupKey ?? 'all',
              },
            ],
            onClear: () => handleCategorySelect('all'),
            search,
          },
    [
      catalogOverviewCards,
      catalogTotal,
      handleCategorySelect,
      isAdminScope,
      isLoadingCatalog,
      search,
      selectedGroupKey,
      translate,
    ],
  );
  usePublishModelsToolbar(modelsToolbar);

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
  const handleRowClick = getModelHref
    ? openModel
    : isPricingInline && onPricingDetails
      ? onPricingDetails
      : handleViewDetails;
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
              ...(getModelHref
                ? { href: getModelHref }
                : { onClick: handleViewDetails }),
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
      getModelHref,
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
