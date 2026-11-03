import type { ReactNode } from 'react';

/** A titled group of detail inside a row's right sidebar. */
export interface RowSidebarSectionProps {
  children: ReactNode;
  title: string;
}

export interface RowSidebarStat {
  id: string;
  label: string;
  /** Already formatted for display. */
  value: string;
  /** Change versus the last period, in percent; omit to hide. */
  trend?: number;
  /** Words after the trend, e.g. "vs last period". */
  trendLabel?: string;
}

export interface RowSidebarStatsProps {
  isLoading?: boolean;
  stats: RowSidebarStat[];
}

export interface RowSidebarTrendProps {
  emptyLabel: string;
  isLoading?: boolean;
  /** Accessible description of the chart, e.g. "Engagement per day". */
  label: string;
  /** One value per period, oldest first. */
  points: number[];
}

export interface RowSidebarBreakdownRow {
  id: string;
  /** Leading mark, e.g. a platform icon. */
  icon?: ReactNode;
  label: string;
  /** Share of the whole, 0 to 100. */
  share: number;
  /** Already formatted for display. */
  value: string;
}

export interface RowSidebarBreakdownProps {
  emptyLabel: string;
  isLoading?: boolean;
  rows: RowSidebarBreakdownRow[];
}

export interface RowSidebarItem {
  id: string;
  /** Page the item opens; omit for a plain row. */
  href?: string;
  /** Leading mark, e.g. a platform icon. */
  icon?: ReactNode;
  meta?: string;
  title: string;
}

export interface RowSidebarItemListProps {
  emptyLabel: string;
  isLoading?: boolean;
  items: RowSidebarItem[];
}
