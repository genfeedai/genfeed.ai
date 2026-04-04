import type {
  IFilters,
  IFiltersState,
} from '@cloud/interfaces/utils/filters.interface';
import type { TableAction, TableColumn } from '@props/ui/display/table.props';
import type { FiltersBarProps } from '@props/ui/forms/filters.props';
import type { ComponentType, ReactNode } from 'react';

export interface ListPageLayoutProps<T> {
  title: string;
  description?: string;
  icon?: ComponentType<{ className?: string }>;
  items: T[];
  columns: TableColumn<T>[];
  actions?: TableAction<T>[];
  isLoading?: boolean;
  emptyLabel?: string;
  filters: IFiltersState;
  onFiltersChange: (filters: IFiltersState, query: IFilters) => void;
  visibleFilters?: FiltersBarProps['visibleFilters'];
  filterOptions?: FiltersBarProps['filterOptions'];
  onCreate?: () => void;
  createLabel?: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  showPagination?: boolean;
  bulkActions?: ReactNode;
  getRowKey?: (item: T) => string;
  getRowClassName?: (item: T) => string;
  className?: string;
}
