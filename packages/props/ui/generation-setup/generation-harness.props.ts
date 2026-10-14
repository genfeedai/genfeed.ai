import type {
  GenerationBrandMode,
  GenerationHarnessReceipt,
  GenerationHarnessSettings,
  UpdateGenerationHarnessSettings,
} from '@genfeedai/contracts/interfaces/content/generation-harness.interface';

export interface GenerationHarnessSettingsCardProps {
  showTitle?: boolean;
  className?: string;
  brandId?: string;
  error: string | null;
  isLoading: boolean;
  isSaving: boolean;
  onRefresh: () => void;
  onSave: (
    scope: UpdateGenerationHarnessSettings['scope'],
    isEnabled: boolean | null,
  ) => Promise<void>;
  settings: GenerationHarnessSettings | null;
}

export interface GenerationHarnessSettingsPopoverProps {
  className?: string;
  isDisabled?: boolean;
}

export interface GenerationHarnessReceiptProps {
  receipt: GenerationHarnessReceipt;
}

export interface BrandModeBadgeProps {
  /** Receipts written before brand modes existed carry none; nothing renders. */
  brandMode?: GenerationBrandMode;
  className?: string;
}
