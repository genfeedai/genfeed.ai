import type {
  IBrandOnboardingScan,
  IBrandOnboardingScanRequest,
} from '@genfeedai/contracts/interfaces';
export interface BrandGuideScope {
  brandId: string;
  organizationId: string;
}
export interface BrandGuidePanelProps {
  brandId: string;
  websiteUrl: string;
  onWebsiteUrlChange: (value: string) => void;
  isExiting: boolean;
  errorMessage: string | null;
  onContinue: () => void;
  onSkip: () => void;
  onRefreshBrand: () => Promise<void>;
}
export interface UseBrandGuideScanOptions {
  brandId: string;
}
export interface BrandGuideScanState {
  scan: IBrandOnboardingScan | null;
  phase: 'resolving' | 'idle' | 'starting' | 'observing' | 'reconcile-error';
  slow: boolean;
  request: IBrandOnboardingScanRequest | null;
  refreshKey: number;
  error: boolean;
}
export interface UseBrandGuideScanResult extends BrandGuideScanState {
  start: (url: string) => Promise<void>;
  reconcile: () => Promise<void>;
}

export interface BrandGuideExitEpoch {
  scopeKey: string;
  userId: string;
  version: number;
  mounted: boolean;
  exiting: boolean;
}
