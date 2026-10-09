import type { StudioSystemPreset } from '@genfeedai/contracts/constants/studio-system-presets.constant';
import type {
  FormDropdownOption,
  IModel,
  IStudioLook,
  StudioGenerateCapabilities,
} from '@genfeedai/contracts/interfaces';
import type { CrunInputControls } from '@genfeedai/contracts/interfaces/content/crun-contract.interface';
import type {
  GenerationSetup,
  GenerationSetupFieldKey,
  GenerationSetupSource,
  GenerationSetupType,
  GenerationSetupValues,
} from '@genfeedai/contracts/interfaces/studio/generation-setup.interface';
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

/** Per-field option lists for Look. Empty on the agent composer. */
export type GenerationSetupLookOptions = Partial<
  Record<GenerationSetupLookFieldKey, readonly FormDropdownOption[]>
>;

/** One entry in the Type switcher — Studio offers several, the agent offers two. */
export interface GenerationSetupTypeOption {
  label: string;
  value: GenerationSetupType;
}

/** Setter every field control calls. Always marks the field source `user`. */
export type GenerationSetupFieldSetter = <K extends GenerationSetupFieldKey>(
  key: K,
  value: GenerationSetupValues[K],
) => void;

export interface GenerationSetupImageEditingMode {
  isEnabled: boolean;
  label: string;
  onChange: (next: boolean) => void;
}

export interface GenerationSetupPopoverProps {
  showPresets?: boolean;
  /** One compact entry point for Studio's type and settings. */
  isIconOnly?: boolean;
  /** Studio's explicit image editing override; other surfaces omit it. */
  imageEditing?: GenerationSetupImageEditingMode;
  showEnhancementSettings?: boolean;
  align?: 'start' | 'center' | 'end';
  inputControls?: CrunInputControls;
  referenceCount?: number;
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
  /** Forwarded to the trigger — see `GenerationSetupTriggerProps.isTypeCommitted`. */
  isTypeCommitted?: boolean;
  /** Surface-provided label for the active model and generation settings. */
  triggerLabel?: string;
  onSetField: GenerationSetupFieldSetter;
  onApplyPreset: (preset: IStudioLook) => void;
  onSavePreset: (label: string) => void;
  onDeletePreset?: (presetId: string) => void;
  onResetField: (key: GenerationSetupFieldKey) => void;
  onResetAll: () => void;
  onClearPreset: () => void;
  onTypeChange?: (type: GenerationSetupType) => void;
  /** Null/undefined disables the credit lock on model rows. */
  creditsAvailable?: number | null;
  isDisabled?: boolean;
  className?: string;
  buttonRef?: RefObject<HTMLButtonElement | null>;
  /**
   * The user's saved Advanced Mode. When provided, the popover shows the
   * Auto/Advanced button group; the surface decides what Advanced reveals.
   */
  advancedMode?: GenerationSetupAdvancedMode;
}

export interface GenerationSetupAdvancedMode {
  isEnabled: boolean;
  onChange: (next: boolean) => void;
}

export interface GenerationSetupTriggerProps {
  isIconOnly?: boolean;
  setup: GenerationSetup;
  typeOptions: readonly GenerationSetupTypeOption[];
  models: readonly IModel[];
  isOpen: boolean;
  isDisabled?: boolean;
  className?: string;
  /** When false, the chip omits aspect ratio (music / voice / avatar). */
  hasAspectRatio?: boolean;
  /**
   * The surface has committed to `setup.values.type` even though the type
   * field itself is agent-owned (the agent composer locks direct media once a
   * model or ratio is picked). The chip then names that type, never "Agent".
   */
  isTypeCommitted?: boolean;
  /** Surface-provided label for the active model and generation settings. */
  triggerLabel?: string;
}

export interface GenerationSetupFieldIconProps {
  fieldKey: GenerationSetupFieldKey;
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
  showPresets?: boolean;
  showEnhancementSettings?: boolean;
  capabilities: StudioGenerateCapabilities;
  inputControls?: CrunInputControls;
  isDisabled?: boolean;
  lookOptions: GenerationSetupLookOptions;
  models: readonly IModel[];
  onCustomize: (section: GenerationSetupCustomizeSectionId) => void;
  onResetAll: () => void;
  onSetField: GenerationSetupFieldSetter;
  onTypeChange?: (type: GenerationSetupType) => void;
  presets: readonly IStudioLook[];
  setup: GenerationSetup;
  typeOptions: readonly GenerationSetupTypeOption[];
}

export interface GenerationSetupPresetsSectionProps {
  isDisabled?: boolean;
  isPresetsLoading?: boolean;
  onApplyPreset: (preset: IStudioLook) => void;
  onDeletePreset?: (presetId: string) => void;
  onSavePreset: (label: string) => void;
  presets: readonly IStudioLook[];
  setup: GenerationSetup;
}

export interface GenerationSetupPresetsPopoverProps
  extends GenerationSetupPresetsSectionProps {
  onClearPreset: () => void;
  systemPresets?: readonly StudioSystemPreset[];
  onApplySystemPreset?: (preset: StudioSystemPreset) => void;
}

export interface GenerationSetupPresetPreviewProps {
  preset: StudioSystemPreset;
  isAnimated?: boolean;
}

export interface GenerationSetupOptionPickerProps {
  label: string;
  value: string;
  options: readonly {
    value: string;
    label: string;
    isPlatformDefault?: boolean;
  }[];
  onValueChange: (value: string) => void;
}

export type GenerationSetupCustomizeSectionId =
  | 'type'
  | 'enhancement'
  | 'brand'
  | 'look'
  | 'model'
  | 'output'
  | 'presets';

export interface GenerationSetupCustomizePanelProps {
  typeOptions: readonly GenerationSetupTypeOption[];
  onTypeChange?: (type: GenerationSetupType) => void;
  inputControls?: CrunInputControls;
  referenceCount?: number;
  capabilities: StudioGenerateCapabilities;
  creditsAvailable?: number | null;
  favoriteModelKeys: string[];
  initialSection: GenerationSetupCustomizeSectionId;
  isPresetsLoading?: boolean;
  onApplyPreset: (preset: IStudioLook) => void;
  onDeletePreset?: (presetId: string) => void;
  presets: readonly IStudioLook[];
  isDisabled?: boolean;
  lookOptions: GenerationSetupLookOptions;
  models: readonly IModel[];
  onBack: () => void;
  onFavoriteToggle: (modelKey: string) => void;
  onResetField: (key: GenerationSetupFieldKey) => void;
  onSavePreset: (label: string) => void;
  onSetField: GenerationSetupFieldSetter;
  reasons: Partial<Record<GenerationSetupFieldKey, string>>;
  setup: GenerationSetup;
}

export interface GenerationSetupModelSectionProps {
  capabilities: StudioGenerateCapabilities;
  creditsAvailable?: number | null;
  favoriteModelKeys: string[];
  isDisabled?: boolean;
  models: readonly IModel[];
  onFavoriteToggle: (modelKey: string) => void;
  onSetField: GenerationSetupFieldSetter;
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
  inputControls?: CrunInputControls;
  referenceCount?: number;
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
