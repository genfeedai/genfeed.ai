import type { IBusinessAnalytics } from '@services/analytics/analytics.service';

export interface AnalyticsDetailPageProps {
  params: Promise<{ id: string }>;
}

export interface BrandDetailProps {
  brandId: string;
}

export interface OrganizationDetailProps {
  organizationId: string;
}

export interface EntityAnalytics {
  totalPosts: number;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalSaves: number;
  avgEngagementRate: number;
  totalEngagement: number;
  viewsGrowth: number;
  engagementGrowth: number;
  activePlatforms: string[];
  bestPerformingPlatform: string;
}

export interface EntityLogo {
  cdnUrl?: string;
}

export interface LeaderTableProps {
  title: string;
  leaders: Array<{
    organizationId: string;
    organizationName: string;
    amount?: number;
    count?: number;
  }>;
  valueFormatter: (item: { amount?: number; count?: number }) => string;
  valueLabel: string;
}

export interface ComparisonCardProps {
  title: string;
  leftLabel: string;
  leftValue: string;
  rightLabel: string;
  rightValue: string;
  difference?: string;
}

export interface DailySeriesChartProps {
  title: string;
  data: Array<{ date: string; amount?: number; count?: number }>;
  valueKey: 'amount' | 'count';
  formatter: (value: number) => string;
}

export interface ProjectionCardProps {
  projections: IBusinessAnalytics['projections'];
}

export interface AnalyticsOrganizationsListProps {
  basePath?: string;
}
