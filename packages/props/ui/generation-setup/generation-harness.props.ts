import type {
  GenerationBrandMode,
  GenerationHarnessReceipt,
} from '@genfeedai/contracts/interfaces/content/generation-harness.interface';

export interface GenerationHarnessReceiptProps {
  receipt: GenerationHarnessReceipt;
}

export interface BrandModeBadgeProps {
  /** Receipts written before brand modes existed carry none; nothing renders. */
  brandMode?: GenerationBrandMode;
  className?: string;
}
