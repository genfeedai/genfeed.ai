import type { BrandedGenerationActorV1 } from '@api/services/branded-generation-receipts/branded-generation-receipts.types';
import type { BreakoutResponseView } from '@genfeedai/contracts/interfaces';

export type BreakoutResponseReadActor = BrandedGenerationActorV1;
export interface BreakoutResponseListQuery {
  page?: number;
  limit?: number;
  credentialId?: string;
}
export interface BreakoutResponseReadPage {
  docs: BreakoutResponseView[];
  page: number;
  limit: number;
  totalDocs: number;
  totalPages: number;
}
