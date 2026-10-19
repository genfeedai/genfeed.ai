import type {
  OutlierPerformanceResponse,
  OutlierSnapshotResponse,
} from '@genfeedai/contracts/interfaces';

export interface AnalyticsOutliersProps {
  brandId?: string;
  platform?: string;
  tier?: 'outlier' | 'breakout';
}

export interface OutlierBaselineDrawerProps {
  isOpen: boolean;
  isLoading: boolean;
  posts: OutlierPerformanceResponse[];
  snapshot: OutlierSnapshotResponse | null;
  onClose: () => void;
}
