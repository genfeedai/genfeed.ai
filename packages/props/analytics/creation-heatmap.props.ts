import type { IStreakCalendarDay } from '@genfeedai/contracts/types';

export interface CreationHeatmapProps {
  calendar: Record<string, IStreakCalendarDay | undefined>;
  isLoading?: boolean;
}

export interface CreationHeatmapCell {
  dayKey: string | null;
}
