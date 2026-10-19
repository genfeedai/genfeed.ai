import type { OutlierPerformanceResponse } from '@genfeedai/contracts/interfaces';

export interface AnalyticsOutliersProps {
  brandId?: string;
  platform?: string;
  tier?: 'outlier' | 'breakout';
}

export interface OutlierBaselinePanelProps {
  /** Detail page of the underlying post; omitted for posts we do not own. */
  openHref?: string;
  post: OutlierPerformanceResponse;
}
