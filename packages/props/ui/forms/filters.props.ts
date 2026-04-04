import type { IFieldOption } from '@cloud/interfaces';
import type {
  IFilters,
  IFiltersState,
} from '@cloud/interfaces/utils/filters.interface';

export interface FiltersBarProps {
  filters: IFiltersState;
  onFiltersChange: (filters: IFiltersState, query: IFilters) => void;
  className?: string;
  visibleFilters?: {
    search?: boolean;
    status?: boolean;
    format?: boolean;
    type?: boolean;
    provider?: boolean;
    model?: boolean;
    sort?: boolean;
    favorite?: boolean;
    brand?: boolean;
    category?: boolean;
  };
  filterOptions?: {
    status?: readonly IFieldOption[];
    format?: readonly IFieldOption[];
    type?: readonly IFieldOption[];
    provider?: readonly IFieldOption[];
    model?: readonly IFieldOption[];
    sort?: readonly IFieldOption[];
    favorite?: readonly IFieldOption[];
    brand?: readonly IFieldOption[];
    category?: readonly IFieldOption[];
  };
}
