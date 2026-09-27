/**
 * Props and interfaces for insights analytics pages
 */

import type { InsightCategory, InsightImpact } from '@genfeedai/contracts';

export interface Insight {
  id: string;
  category: InsightCategory;
  title: string;
  description: string;
  impact: InsightImpact;
  confidence: number;
  actionableSteps: string[];
  relatedMetrics: string[];
  isRead: boolean;
  createdAt: Date;
}

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
