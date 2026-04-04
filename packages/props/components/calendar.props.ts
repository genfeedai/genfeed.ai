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
}
