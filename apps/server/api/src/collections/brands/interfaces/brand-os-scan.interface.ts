import type {
  IBrandKitDraft,
  IBrandOnboardingScan,
  IScrapedBrandData,
} from '@genfeedai/contracts/interfaces';

export interface BrandOsScanInput {
  organizationId: string;
  brandId: string;
  url: string;
  requestId: string;
}
export interface BrandOsScanBaseline {
  revisionId: string;
  updatedAt: string;
}
export interface BrandOsScanMarker extends IBrandOnboardingScan {
  schemaVersion: 1;
  baseline: BrandOsScanBaseline | null;
}
export interface BrandOsScanApprovedBaseline extends BrandOsScanBaseline {
  content: IBrandKitDraft;
}
export interface BrandOsScanPreparation {
  scan: IBrandOnboardingScan;
  shouldScrape: boolean;
  baseline: BrandOsScanApprovedBaseline | null;
}
export type BrandOsScanFailureCode =
  | 'brand_scan.timed_out'
  | 'brand_scan.failed'
  | 'brand_scan.no_evidence'
  | 'brand_scan.invalid_baseline'
  | 'brand_scan.invalid_content'
  | 'brand_scan.content_too_large'
  | 'brand_scan.revision_conflict';

export interface BrandOsScanCollection {
  scan: IBrandOnboardingScan;
  scrapedData: IScrapedBrandData | null;
}
