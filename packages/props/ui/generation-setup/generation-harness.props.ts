import type { GenerationHarnessSettings, UpdateGenerationHarnessSettings, GenerationHarnessReceipt } from '@genfeedai/contracts/interfaces/content/generation-harness.interface';

export interface GenerationHarnessSettingsCardProps {
  brandId?: string;
  error: string | null;
  isLoading: boolean;
  isSaving: boolean;
  onRefresh: () => void;
  onSave: (scope: UpdateGenerationHarnessSettings['scope'], isEnabled: boolean | null) => Promise<void>;
  settings: GenerationHarnessSettings | null;
}

export interface GenerationHarnessSettingsPopoverProps {
  className?: string;
  isDisabled?: boolean;
}

export interface GenerationHarnessReceiptProps {
  receipt: GenerationHarnessReceipt;
}
