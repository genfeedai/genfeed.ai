import type { IFiltersState } from '@cloud/interfaces/utils/filters.interface';
import type { ContentProps } from '@props/layout/content.props';

export interface TagsListProps extends ContentProps {
  filter: 'all' | 'default' | 'organization' | 'account';
  externalFilters?: IFiltersState;
  refreshTrigger?: number;
}
