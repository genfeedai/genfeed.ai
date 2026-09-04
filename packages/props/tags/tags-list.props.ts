import type { ContentScope } from '@genfeedai/contracts/interfaces';
import type { IFiltersState } from '@genfeedai/contracts/interfaces/utils/filters.interface';

export interface TagsListProps {
  scope: ContentScope;
  filter: 'all' | 'default' | 'organization' | 'account';
  externalFilters?: IFiltersState;
  refreshTrigger?: number;
  onRefreshingChange?: (isRefreshing: boolean) => void;
}
