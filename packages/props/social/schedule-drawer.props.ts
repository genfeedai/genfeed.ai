import type { IBrand } from '@genfeedai/interfaces';

export interface ScheduleDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  brands: IBrand[];
  selectedBrandIds: string[];
  onSchedule?: (scheduledDate: Date, timezone: string) => void;
  defaultTimezone?: string;
}
