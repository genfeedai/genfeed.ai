import type { ComponentType } from 'react';

export interface StatsCardItem {
  label: string;
  count: number;
  icon: ComponentType<{ className?: string; size?: number }>;
  /** e.g., "bg-purple-500/20 text-purple-400" */
  colorClass: string;
  /** Defaults to "{count} {label}" */
  description?: string;
  /** e.g., "post" vs "posts" */
  singularLabel?: string;
  cardClassName?: string;
}

export interface StatsCardsProps {
  items: StatsCardItem[];
  className?: string;
  isLoading?: boolean;
}
