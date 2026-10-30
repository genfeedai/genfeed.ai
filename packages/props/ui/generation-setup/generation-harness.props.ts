import type {
  GenerationBrandMode,
  GenerationHarnessReceipt,
  GenerationHarnessSettings,
  UpdateGenerationHarnessSettings,
} from '@genfeedai/contracts/interfaces/content/generation-harness.interface';
import type { ReactNode } from 'react';

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

/** One value of the Inherit / On / Off control: `null` is Inherit. */
export type GenerationTriStateValue = boolean | null;

export interface GenerationTriStateControlProps {
  ariaLabel: string;
  /** Show the Default (inherit) segment; the organization row has nothing to inherit from. */
  hasInherit?: boolean;
  isDisabled?: boolean;
  onChange: (value: GenerationTriStateValue) => void;
  /** What the setting resolves to now; outlined on the segment while Inherit is selected. */
  resolvedValue: boolean;
  value: GenerationTriStateValue;
}

export interface GenerationToggleRowProps {
  children: ReactNode;
  /** One muted line under the label saying what the row controls. */
  description?: ReactNode;
  /** Optional provenance icon rendered before the label. */
  leading?: ReactNode;
  label: ReactNode;
}
