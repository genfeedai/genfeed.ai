import type { DateRange } from '../utils/date.interface';
import type { AnalyticsQueryFilterKey } from './analytics-query-reference.interface';

export type AnalyticsQueryFilters = Readonly<
  Partial<Record<AnalyticsQueryFilterKey, string>>
>;

export interface AnalyticsContextType {
  dateRange: DateRange;
  setDateRange: (range: DateRange) => void;
  filters: AnalyticsQueryFilters;
  setFilter: (key: AnalyticsQueryFilterKey, value?: string) => void;
  refreshTrigger: number;
  triggerRefresh: () => void;
  isRefreshing: boolean;
  brandId?: string;
  setBrandId?: (id: string | undefined) => void;
}
