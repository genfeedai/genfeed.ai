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
