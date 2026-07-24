import type { ReactNode } from 'react';

export interface CalendarItem {
  id: string;
  title: string;
  scheduledDate?: string | Date;
  status: string;
  isDisabled?: boolean;
}

export interface ContentCalendarProps<T extends CalendarItem> {
  items: T[];
  title?: string;
  description?: string;
  onEventClick: (item: T) => void;
  onDatesChange: (start: Date, end: Date) => void;
  getEventColor: (item: T) => string;
  filterControls?: ReactNode;
  modal?: ReactNode;
  /**
   * Rendered in place of the (otherwise blank) time grid when there are no
   * schedulable events. Lets the host surface a meaningful empty state instead
   * of a full 48-row grid that reads as broken rather than "no events".
   */
  emptyState?: ReactNode;
}
