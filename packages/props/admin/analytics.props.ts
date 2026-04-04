/**
 * Props and interfaces for admin analytics pages
 */

/**
 * Props for dynamic route pages with ID parameter
 */
export interface AnalyticsDetailPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Props for Brand detail component
 */
export interface BrandDetailProps {
  brandId: string;
}

/**
 * Props for Organization detail component
 */
export interface OrganizationDetailProps {
  organizationId: string;
}

/**
 * Analytics data shape for brands and organizations
 */
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

/**
 * Logo object type for entities with cdnUrl
 */
export interface EntityLogo {
  cdnUrl?: string;
}
