import type { FilterMenuFacet } from '@genfeedai/props/ui/forms/filter-menu.props';

export interface AnalyticsFilterMenuProps {
  facets: readonly FilterMenuFacet[];
  onClear: () => void;
}
