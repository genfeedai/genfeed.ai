import type {
  FormDropdownOption,
  IModel,
  IStudioLook,
  StudioGenerateCapabilities,
  StudioGenerateType,
} from '@genfeedai/interfaces';
import type {
  GenerationSetup,
  GenerationSetupFieldKey,
  GenerationSetupSource,
  GenerationSetupValues,
} from '@genfeedai/interfaces/studio/generation-setup.interface';
import type { ReactNode, RefObject } from 'react';

/** Look fields the customize panel renders from `useElements`-sourced options. */
export type GenerationSetupLookFieldKey = Extract<
  GenerationSetupFieldKey,
  | 'camera'
  | 'cameraMovement'
  | 'lens'
  | 'lighting'
  | 'mood'
  | 'promptTemplate'
  | 'resolution'
  | 'scene'
  | 'style'
>;

/** Per-field option lists for the Look tab. Empty on the agent composer. */
export type GenerationSetupLookOptions = Partial<
  Record<GenerationSetupLookFieldKey, readonly FormDropdownOption[]>
>;

/** One entry in the Type switcher — Studio offers several, the agent offers two. */
export interface GenerationSetupTypeOption {
  label: string;
  value: StudioGenerateType;
}

/** Setter every field control calls. Always marks the field source `user`. */
export type GenerationSetupFieldSetter = <K extends GenerationSetupFieldKey>(
  key: K,
  value: GenerationSetupValues[K],
) => void;

export interface GenerationSetupPopoverProps {
  scopeKey: string;
  setup: GenerationSetup;
  reasons: Partial<Record<GenerationSetupFieldKey, string>>;
  capabilities: StudioGenerateCapabilities;
  /** Omitted (or a single entry) on surfaces that lock the type, e.g. agent image-only. */
  typeOptions: readonly GenerationSetupTypeOption[];
  models: readonly IModel[];
  favoriteModelKeys: string[];
  onFavoriteToggle: (modelKey: string) => void;
  lookOptions: GenerationSetupLookOptions;
  presets: readonly IStudioLook[];
  isPresetsLoading?: boolean;
  onSetField: GenerationSetupFieldSetter;
  onApplyPreset: (preset: IStudioLook) => void;
  onSavePreset: (label: string) => void;
  onDeletePreset?: (presetId: string) => void;
  onResetField: (key: GenerationSetupFieldKey) => void;
  onResetAll: () => void;
  onClearPreset: () => void;
  onTypeChange?: (type: StudioGenerateType) => void;
  /** Null/undefined disables the credit lock on model rows. */
  creditsAvailable?: number | null;
  /** e.g. "~4 credits per output" shown under the Model tab. */
  creditQuoteLabel?: string;
  isDisabled?: boolean;
  className?: string;
  buttonRef?: RefObject<HTMLButtonElement | null>;
}

export interface GenerationSetupTriggerProps {
  setup: GenerationSetup;
  typeOptions: readonly GenerationSetupTypeOption[];
  models: readonly IModel[];
  isOpen: boolean;
  isDisabled?: boolean;
  className?: string;
}

export interface GenerationSetupProvenanceDotProps {
  reason?: string;
  source: GenerationSetupSource;
}

export interface GenerationSetupFieldRowProps {
  children: ReactNode;
  fieldKey: GenerationSetupFieldKey;
  isResettable?: boolean;
  label: string;
  onReset?: (key: GenerationSetupFieldKey) => void;
  reason?: string;
  source: GenerationSetupSource;
}

export interface GenerationSetupFrontDoorProps {
  capabilities: StudioGenerateCapabilities;
  creditQuoteLabel?: string;
  isDisabled?: boolean;
  isPresetsLoading?: boolean;
  models: readonly IModel[];
  onApplyPreset: (preset: IStudioLook) => void;
  onCustomize: (section?: GenerationSetupCustomizeSectionId) => void;
  onDeletePreset?: (presetId: string) => void;
  onSearch: () => void;
  presets: readonly IStudioLook[];
  reasons: Partial<Record<GenerationSetupFieldKey, string>>;
  setup: GenerationSetup;
  typeOptions: readonly GenerationSetupTypeOption[];
}

export interface GenerationSetupSearchOption {
  fieldKey: GenerationSetupFieldKey;
  group: string;
  keywords?: string[];
  label: string;
  value: GenerationSetupValues[GenerationSetupFieldKey];
}

export interface GenerationSetupSearchProps {
  capabilities: StudioGenerateCapabilities;
  lookOptions: GenerationSetupLookOptions;
  models: readonly IModel[];
  onBack: () => void;
  onSetField: GenerationSetupFieldSetter;
  setup: GenerationSetup;
  typeOptions: readonly GenerationSetupTypeOption[];
}

export type GenerationSetupCustomizeSectionId =
  | 'brand'
  | 'look'
  | 'model'
  | 'output';

export interface GenerationSetupCustomizePanelProps {
  capabilities: StudioGenerateCapabilities;
  creditQuoteLabel?: string;
  creditsAvailable?: number | null;
  favoriteModelKeys: string[];
  initialSection?: GenerationSetupCustomizeSectionId;
  isDisabled?: boolean;
  lookOptions: GenerationSetupLookOptions;
  models: readonly IModel[];
  onBack: () => void;
  onFavoriteToggle: (modelKey: string) => void;
  onResetAll: () => void;
  onResetField: (key: GenerationSetupFieldKey) => void;
  onSavePreset: (label: string) => void;
  onSetField: GenerationSetupFieldSetter;
  onTypeChange?: (type: StudioGenerateType) => void;
  reasons: Partial<Record<GenerationSetupFieldKey, string>>;
  setup: GenerationSetup;
  typeOptions: readonly GenerationSetupTypeOption[];
}

export interface GenerationSetupModelSectionProps {
  capabilities: StudioGenerateCapabilities;
  creditQuoteLabel?: string;
  creditsAvailable?: number | null;
  favoriteModelKeys: string[];
  isDisabled?: boolean;
  models: readonly IModel[];
  onFavoriteToggle: (modelKey: string) => void;
  onResetField: (key: GenerationSetupFieldKey) => void;
  onSetField: GenerationSetupFieldSetter;
  reasons: Partial<Record<GenerationSetupFieldKey, string>>;
  setup: GenerationSetup;
}

export interface GenerationSetupLookSectionProps {
  lookOptions: GenerationSetupLookOptions;
  onResetField: (key: GenerationSetupFieldKey) => void;
  onSetField: GenerationSetupFieldSetter;
  reasons: Partial<Record<GenerationSetupFieldKey, string>>;
  setup: GenerationSetup;
}

export interface GenerationSetupOutputSectionProps {
  capabilities: StudioGenerateCapabilities;
  onResetField: (key: GenerationSetupFieldKey) => void;
  onSetField: GenerationSetupFieldSetter;
  reasons: Partial<Record<GenerationSetupFieldKey, string>>;
  setup: GenerationSetup;
}

export interface GenerationSetupBrandSectionProps {
  onResetField: (key: GenerationSetupFieldKey) => void;
  onSetField: GenerationSetupFieldSetter;
  reasons: Partial<Record<GenerationSetupFieldKey, string>>;
  setup: GenerationSetup;
}

export interface GenerationSetupSavePresetRowProps {
  isDisabled?: boolean;
  onSavePreset: (label: string) => void;
}
