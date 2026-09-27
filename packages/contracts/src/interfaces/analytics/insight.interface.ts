import type { InsightCategory, InsightImpact } from '../..';

export interface IInsightResponse {
  id: string;
  category: InsightCategory;
  title: string;
  description: string;
  impact: InsightImpact;
  confidence: number;
  actionableSteps: string[];
  relatedMetrics: string[];
  data?: Record<string, unknown>;
  isRead: boolean;
  isDismissed: boolean;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt?: Date;
}

export interface IIngredientKPIMetrics {
  total: number;
  generated: number;
  rejected: number;
  validated: number;
  byCategory?: Record<
    string,
    {
      generated: number;
      rejected: number;
      validated: number;
    }
  >;
}

export interface IUsageMetrics {
  currentBalance: number;
  usage7Days: number;
  usage30Days: number;
  trendPercentage: number;
  breakdown: IBreakdownItem[];
}

export interface IBreakdownItem {
  source: string;
  amount: number;
  count: number;
}
