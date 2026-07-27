import type { ReactNode } from 'react';

export interface SurfaceSummaryItem {
  /** Secondary text under the value — context, not a second metric. */
  accent?: string;
  icon?: ReactNode;
  isLoading?: boolean;
  label: string;
  /** Extra card classes for per-item emphasis (e.g. a warning tint). */
  tone?: string;
  value: string;
}
