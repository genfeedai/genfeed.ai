import type {
  IPlatformFeatureSettings,
  TypedDecisionMode,
} from '@genfeedai/contracts/interfaces';
import type { ReactNode } from 'react';

/** Tabs of /admin platform settings that edit fields of the shared form. */
export type PlatformSettingsFormTab =
  | 'billing'
  | 'decisions'
  | 'agent'
  | 'media'
  | 'providers'
  | 'accounts'
  | 'discord';

/** Every /admin platform settings tab; notifications save on their own. */
export type PlatformSettingsTab = PlatformSettingsFormTab | 'notifications';

/** Feature switches whose value is a nullable string, cleared to `null`. */
export type PlatformNullableTextFeatureSettingKey = {
  [TKey in keyof IPlatformFeatureSettings]: IPlatformFeatureSettings[TKey] extends
    | string
    | null
    ? null extends IPlatformFeatureSettings[TKey]
      ? TKey
      : never
    : never;
}[keyof IPlatformFeatureSettings];

/** Feature switches whose value is a plain string; an emptied field saves `''`. */
export type PlatformRequiredTextFeatureSettingKey = {
  [TKey in keyof IPlatformFeatureSettings]: IPlatformFeatureSettings[TKey] extends string
    ? string extends IPlatformFeatureSettings[TKey]
      ? TKey
      : never
    : never;
}[keyof IPlatformFeatureSettings];

/** A titled group of fields inside one platform settings tab. */
export interface PlatformSettingsGroupProps {
  children: ReactNode;
  description?: string;
  title?: string;
}

/** Feature switches whose value is a number (modes, counts, thresholds). */
export type PlatformNumericFeatureSettingKey = {
  [TKey in keyof IPlatformFeatureSettings]: IPlatformFeatureSettings[TKey] extends number
    ? TKey
    : never;
}[keyof IPlatformFeatureSettings];

/** The product feature switches of one /admin platform settings tab (#5407). */
export interface PlatformFeatureSettingsFieldsProps {
  /** The deployment has an email provider; email verification needs one. */
  isEmailDeliveryConfigured: boolean;
  isDisabled: boolean;
  onChange: (next: IPlatformFeatureSettings) => void;
  /** Reports each numeric field's validity so the page can block a save. */
  onValidityChange: (fieldId: string, isValid: boolean) => void;
  section: PlatformSettingsFormTab;
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
