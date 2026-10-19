import type { IBrandWithStats } from '@services/analytics/analytics.service';

export interface AnalyticsBrandSummaryProps {
  brand: IBrandWithStats;
  /** The brand's analytics page. */
  openHref: string;
}
