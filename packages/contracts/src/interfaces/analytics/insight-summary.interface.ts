import type { InsightCategory, InsightImpact } from '../..';

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
