import type { BrandCompletenessField } from '@genfeedai/helpers';

export interface BrandFromUrlInput {
  url: string;
  label?: string;
  approve?: boolean;
}
export interface BrandFromUrlContext {
  organizationId: string;
  userId: string;
}
export interface BrandFromUrlResult {
  brandId: string;
  revisionId?: string;
  revisionStatus?: 'draft' | 'approved';
  completenessScore?: number;
  incompleteFields?: BrandCompletenessField[];
  reviewUrl: string;
  scanStatus: 'running' | 'succeeded' | 'failed';
  errorCode?: string;
  voiceAnalysis?: 'unavailable';
}
export interface BrandFromUrlOperation {
  createdAt: number;
  running: BrandFromUrlResult;
  completion: Promise<BrandFromUrlResult>;
}
