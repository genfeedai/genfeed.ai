import type {
  IPlatformFeatureSettings,
  TypedDecisionMode,
} from '@genfeedai/contracts/interfaces';

/** Feature switches whose value is a number (modes, counts, thresholds). */
export type PlatformNumericFeatureSettingKey = {
  [TKey in keyof IPlatformFeatureSettings]: IPlatformFeatureSettings[TKey] extends number
    ? TKey
    : never;
}[keyof IPlatformFeatureSettings];

/** The product feature switches section of /admin platform settings (#5407). */
export interface PlatformFeatureSettingsFieldsProps {
  /** The deployment has an email provider; email verification needs one. */
  isEmailDeliveryConfigured: boolean;
  isDisabled: boolean;
  onChange: (next: IPlatformFeatureSettings) => void;
  /** Reports each numeric field's validity so the page can block a save. */
  onValidityChange: (fieldId: string, isValid: boolean) => void;
  settings: IPlatformFeatureSettings;
}

/**
 * A numeric switch. The field keeps the operator's text while it is invalid
 * and only commits a value inside `min..max`; `isOptional` lets an empty field
 * commit `null` (for example, "keep the default threshold").
 */
export interface PlatformNumberSettingFieldProps {
  helpText?: string;
  id: string;
  isDisabled: boolean;
  isInteger?: boolean;
  isOptional?: boolean;
  label: string;
  max: number;
  min: number;
  onCommit: (value: number | null) => void;
  onValidityChange: (fieldId: string, isValid: boolean) => void;
  placeholder?: string;
  value: number | null;
}

export interface PlatformModeSettingFieldProps<
  TMode extends TypedDecisionMode,
> {
  helpText?: string;
  id: string;
  isDisabled: boolean;
  label: string;
  modes: readonly TMode[];
  onChange: (mode: TMode) => void;
  value: TMode;
}
