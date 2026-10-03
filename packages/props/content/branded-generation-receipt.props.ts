import type { BrandIdentitySnapshotV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import type {
  BrandedGenerationPromptInspectionV1,
  BrandedGenerationReceiptReadV1,
  BrandedGenerationReceiptRevisionReadV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation-receipt-read.interface';
import type { BrandIdentityPreviewResult } from '@genfeedai/services/ai/branded-generation-receipts.service';

export interface BrandIdentityPreviewInput {
  organizationId: string;
  brandId: string;
  refreshKey: string | number;
  isOpen: boolean;
}
export interface BrandIdentityPreviewState {
  result: BrandIdentityPreviewResult | null;
  isLoading: boolean;
  error:
    | 'unavailable'
    | 'integrity_failed'
    | 'assets_unavailable'
    | 'load_failed'
    | null;
  refresh: () => void;
  close: () => void;
}
export interface BrandIdentitySnapshotViewProps {
  snapshot: BrandIdentitySnapshotV1 | null;
  organizationId: string;
  brandId: string;
  source: 'current_approved_revision' | 'receipt_snapshot';
  receiptRevision?: number;
}
export interface BrandedGenerationReceiptInspectorInput {
  organizationId: string;
  brandId: string;
  receiptId: string;
  revision?: number;
  isOpen: boolean;
}
export interface BrandedGenerationReceiptInspectorProps
  extends BrandedGenerationReceiptInspectorInput {}
export interface BrandedGenerationReceiptInspectorState {
  receipt:
    | BrandedGenerationReceiptReadV1
    | BrandedGenerationReceiptRevisionReadV1
    | null;
  isLoading: boolean;
  error: 'unavailable' | 'load_failed' | null;
  prompts: Partial<
    Record<
      BrandedGenerationPromptInspectionV1['stage'],
      BrandedGenerationPromptInspectionV1
    >
  >;
  loadingPrompt: BrandedGenerationPromptInspectionV1['stage'] | null;
  promptError: 'restricted' | 'unavailable' | 'load_failed' | null;
  refresh: () => void;
  revealPrompt: (
    stage: BrandedGenerationPromptInspectionV1['stage'],
  ) => Promise<void>;
  hidePrompt: (stage: BrandedGenerationPromptInspectionV1['stage']) => void;
}
