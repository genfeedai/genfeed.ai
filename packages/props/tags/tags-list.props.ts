import type { ContentScope } from '@genfeedai/interfaces';
import type { IFiltersState } from '@genfeedai/interfaces/utils/filters.interface';

export interface TagsListProps {
  scope: ContentScope;
  filter: 'all' | 'default' | 'organization' | 'account';
  externalFilters?: IFiltersState;
  refreshTrigger?: number;
}
