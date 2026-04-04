import type { DateRange } from '../utils/date.interface';

export interface AnalyticsContextType {
  dateRange: DateRange;
  setDateRange: (range: DateRange) => void;
  refreshTrigger: number;
  triggerRefresh: () => void;
  isRefreshing: boolean;
  brandId?: string;
  setBrandId?: (id: string | undefined) => void;
}
