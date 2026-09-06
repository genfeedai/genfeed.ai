import type { IStreakCalendarDay } from '@genfeedai/contracts/types';

export type Props = {
  heatmapDays: string[];
  calendar: Record<string, IStreakCalendarDay>;
};
