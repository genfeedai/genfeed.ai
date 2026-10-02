import type {
  BrandedGenerationPromptInspectionV1,
  BrandedGenerationReceiptReadV1,
  BrandedGenerationReceiptRevisionReadV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation-receipt-read.interface';
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
