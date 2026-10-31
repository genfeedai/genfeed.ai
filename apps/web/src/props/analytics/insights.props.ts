/**
 * Props and interfaces for insights analytics pages
 */

import type { Insight } from '@genfeedai/contracts/interfaces/analytics/insight-summary.interface';

export interface InsightListCardProps {
  insights: Insight[];
  isLoading?: boolean;
  onMarkRead?: (id: string) => void;
  onDismiss?: (id: string) => void;
  className?: string;
}

export interface InsightsOverviewProps {
  brandId?: string;
  className?: string;
}
