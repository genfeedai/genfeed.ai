'use client';

import { EMPTY_STATES } from '@genfeedai/constants';
import { ButtonVariant } from '@genfeedai/enums';
import type { ListPageLayoutProps } from '@props/layout/list-page-layout.props';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import FiltersButton from '@ui/content/filters-button/FiltersButton';
import AppTable from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Button } from '@ui/primitives/button';
import { HiPlus } from 'react-icons/hi2';

/**
 * Standardized list page layout component
 * Combines Container, FiltersButton, ButtonRefresh, Create button, AppTable, and Pagination
 *
 * @example
 * ```typescript
 * <ListPageLayout
 *   title="Tags"
 *   description="Manage your tags"
 *   filters={filters}
 *   onFiltersChange={handleFiltersChange}
 *   onCreate={() => openModal(ModalEnum.TAG)}
 *   createLabel="Tag"
 *   items={tags}
 *   columns={columns}
 *   actions={actions}
 *   isLoading={isLoading}
 * />
 * ```
 */
export default function ListPageLayout<T extends { id: string }>({
  title,
  description,
  icon,
  items,
  columns,
  actions,
  isLoading = false,
  emptyLabel = EMPTY_STATES.DEFAULT,
  filters,
  onFiltersChange,
  visibleFilters,
  filterOptions,
  onCreate,
  createLabel,
  onRefresh,
  isRefreshing = false,
  showPagination = true,
  bulkActions,
  getRowKey,
  getRowClassName,
  className,
}: ListPageLayoutProps<T>) {
  const rightActions = (
    <>
      <FiltersButton
        filters={filters}
        onFiltersChange={onFiltersChange}
        visibleFilters={visibleFilters}
        filterOptions={filterOptions}
      />

      {onRefresh && (
        <ButtonRefresh onClick={onRefresh} isRefreshing={isRefreshing} />
      )}

      {onCreate && createLabel && (
        <Button
          label={
            <>
              <HiPlus /> {createLabel}
            </>
          }
          variant={ButtonVariant.DEFAULT}
          onClick={onCreate}
        />
      )}

      {bulkActions}
    </>
  );

  return (
    <Container
      label={title}
      description={description}
      icon={icon}
      right={rightActions}
      className={className}
    >
      <AppTable<T>
        items={items}
        columns={columns}
        actions={actions}
        isLoading={isLoading}
        getRowKey={getRowKey || ((item) => item.id)}
        getRowClassName={getRowClassName}
        emptyLabel={emptyLabel}
      />

      {showPagination && (
        <div className="mt-4">
          <AutoPagination />
        </div>
      )}
    </Container>
  );
}
