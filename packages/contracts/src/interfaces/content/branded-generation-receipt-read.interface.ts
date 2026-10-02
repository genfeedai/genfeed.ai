import type {
  BrandedGenerationReceiptReadV1,
  BrandedGenerationReceiptRevisionReadV1,
} from '@genfeedai/contracts/api-types/contracts/branded-generation-receipt-read.contract';

export type {
  BrandedGenerationPromptInspectionV1,
  BrandedGenerationReceiptReadV1,
  BrandedGenerationReceiptRevisionReadV1,
} from '@genfeedai/contracts/api-types/contracts/branded-generation-receipt-read.contract';
export interface BrandedGenerationReceiptReadPageV1 {
  items: BrandedGenerationReceiptReadV1[];
  nextCursor: string | null;
}
export interface BrandedGenerationReceiptRevisionReadPageV1 {
  items: BrandedGenerationReceiptRevisionReadV1[];
  nextAfterRevision: number | null;
}
export interface BrandedGenerationReceiptListQueryV1 {
  limit?: number;
  cursor?: string;
}
export interface BrandedGenerationReceiptHistoryQueryV1 {
  limit?: number;
  afterRevision?: number;
}
