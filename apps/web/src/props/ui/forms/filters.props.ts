import type { IFieldOption } from '@genfeedai/contracts/interfaces';
import type {
  IFilters,
  IFiltersState,
} from '@genfeedai/contracts/interfaces/utils/filters.interface';

export interface FiltersBarProps {
  filters: IFiltersState;
  onFiltersChange: (filters: IFiltersState, query: IFilters) => void;
  className?: string;
  /** Sits inside a search field's trailing edge: a compact trigger, no own wrapper spacing. */
  isAttached?: boolean;
  visibleFilters?: {
    /** Read by pages to decide whether to render `FiltersSearch`, which carries the Filters menu inside its field; the menu alone has no search. */
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
