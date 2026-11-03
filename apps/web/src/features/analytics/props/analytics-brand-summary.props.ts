import type { IBrandWithStats } from '@services/analytics/analytics.service';

export interface AnalyticsBrandSummaryProps {
  brand: IBrandWithStats;
  /** The brand's analytics page. */
  openHref: string;
}

/** One platform's slice of a brand's engagement over the selected range. */
export interface BrandSidebarPlatformShare {
  engagement: number;
  platform: string;
  /** Share of the brand's total engagement, 0 to 100. */
  share: number;
}
