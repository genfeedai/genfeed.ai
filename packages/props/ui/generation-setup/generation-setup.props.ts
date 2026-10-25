import type {
  FormDropdownOption,
  IModel,
  IStudioLook,
  StudioPlaygroundCapabilities,
} from '@genfeedai/contracts/interfaces';
import type { CrunInputControls } from '@genfeedai/contracts/interfaces/content/crun-contract.interface';
import type {
  GenerationSetup,
  GenerationSetupFieldKey,
  GenerationSetupSource,
  GenerationSetupType,
  GenerationSetupValues,
} from '@genfeedai/contracts/interfaces/studio/generation-setup.interface';
import type { ReactNode } from 'react';

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

/** Create / Edit switch shown under the Image tab; `isEnabled` means editing. */
export interface GenerationSetupImageEditingMode {
  isEnabled: boolean;
  onChange: (next: boolean) => void;
}

/** A platform-owned preset offered to every organization; it can be applied, never deleted. */
export interface GenerationSetupSystemPreset {
  description?: string;
  id: string;
  label: string;
}

export interface GenerationSetupAdvancedMode {
  isEnabled: boolean;
  onChange: (next: boolean) => void;
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

export interface GenerationSetupSummaryInput {
  formatDuration: (seconds: number) => string;
  inputControls?: CrunInputControls;
  lookOptions: GenerationSetupLookOptions;
  models: readonly IModel[];
  setup: GenerationSetup;
}

export interface GenerationSetupSummary {
  /** The chosen clip length, formatted; empty when the setup has none. */
  durationLabel: string;
  hasLookFields: boolean;
  modelLabel: string;
  selectedModel?: IModel;
}

/** Chips in the toolbar; each opens only its own section. */
export type GenerationSetupChipId =
  | 'aspectRatio'
  | 'brand'
  | 'duration'
  | 'look'
  | 'model'
  | 'output'
  | 'presets';

/**
 * Advanced mode lays the setup out as toolbar chips: Model first, then
 * `afterModel` (the surface's own pickers), then Aspect ratio, Duration and
 * Output, Look, Brand and Presets.
 */
export interface GenerationSetupSectionChipsProps
  extends Omit<GenerationSetupCustomizePanelProps, 'initialSection'> {
  /** Releases a pinned preset; shown in the Presets panel. */
  onClearPreset: () => void;
  /** Rendered between the Model chip and the Aspect ratio chip. */
  afterModel?: ReactNode;
  inputControls?: CrunInputControls;
  lookOptions: GenerationSetupLookOptions;
  /** Surface-owned model controls rendered at the end of the Output menu. */
  outputControls?: ReactNode;
  referenceCount?: number;
  showPresets?: boolean;
}

export interface GenerationSetupPresetsSectionProps {
  isDisabled?: boolean;
  isPresetsLoading?: boolean;
  onApplyPreset: (preset: IStudioLook) => void;
  onApplySystemPreset?: (presetId: string) => void;
  onDeletePreset?: (presetId: string) => void;
  onSavePreset: (label: string) => void;
  presets: readonly IStudioLook[];
  systemPresets?: readonly GenerationSetupSystemPreset[];
  setup: GenerationSetup;
}

export interface GenerationSetupMenuOption {
  description?: string;
  /** Drawn before the label, e.g. the shape of an aspect ratio. */
  icon?: ReactNode;
  isPlatformDefault?: boolean;
  label: string;
  thumbnailUrl?: string;
  value: string;
}

/** The body of one nested submenu: an optional search box and a preview pane. */
export interface GenerationSetupSubmenuListProps {
  /**
   * Keeps the menu open after a pick, for a list nested under another menu so
   * several fields can be changed without reopening it.
   */
  isMenuKeptOpen?: boolean;
  /** Appended as a row that returns the field to the agent's pick. */
  onReset?: () => void;
  onValueChange: (value: string) => void;
  options: readonly GenerationSetupMenuOption[];
  /** Shows the illustration pane for this Look field. */
  previewKind?: GenerationSetupLookPreviewKind;
  /** Shows a search box above the options. */
  isSearchable?: boolean;
  label: string;
  /** Explains a limit of the field, shown under the options. */
  note?: string;
  value: string;
}

export type GenerationSetupLookPreviewKind =
  | 'camera'
  | 'cameraMovement'
  | 'lens'
  | 'lighting'
  | 'mood'
  | 'scene'
  | 'style';

export type GenerationSetupCustomizeSectionId = 'brand' | 'model' | 'presets';

export interface GenerationSetupCustomizePanelProps {
  /** Lets the Presets panel release a pinned preset. */
  onClearPreset?: () => void;
  /** Puts every setup field back to its default; offered at the top of the Presets panel. */
  onResetAll?: () => void;
  typeOptions: readonly GenerationSetupTypeOption[];
  showEnhancementSettings?: boolean;
  capabilities: StudioPlaygroundCapabilities;
  creditsAvailable?: number | null;
  favoriteModelKeys: string[];
  initialSection: GenerationSetupCustomizeSectionId;
  isPresetsLoading?: boolean;
  onApplyPreset: (preset: IStudioLook) => void;
  onApplySystemPreset?: (presetId: string) => void;
  onDeletePreset?: (presetId: string) => void;
  presets: readonly IStudioLook[];
  systemPresets?: readonly GenerationSetupSystemPreset[];
  isDisabled?: boolean;
  models: readonly IModel[];
  onFavoriteToggle: (modelKey: string) => void;
  onResetField: (key: GenerationSetupFieldKey) => void;
  onSavePreset: (label: string) => void;
  onSetField: GenerationSetupFieldSetter;
  reasons: Partial<Record<GenerationSetupFieldKey, string>>;
  setup: GenerationSetup;
}

export interface GenerationSetupModelSectionProps {
  capabilities: StudioPlaygroundCapabilities;
  creditsAvailable?: number | null;
  favoriteModelKeys: string[];
  isDisabled?: boolean;
  models: readonly IModel[];
  onFavoriteToggle: (modelKey: string) => void;
  onSetField: GenerationSetupFieldSetter;
  setup: GenerationSetup;
}

export interface GenerationSetupLookMenuProps {
  lookOptions: GenerationSetupLookOptions;
  onResetField: (key: GenerationSetupFieldKey) => void;
  onSetField: GenerationSetupFieldSetter;
  setup: GenerationSetup;
}

/** The part of the Output setup a chip's menu shows; `rest` is the Output chip. */
export type GenerationSetupOutputSection = 'aspectRatio' | 'duration' | 'rest';

export interface GenerationSetupOutputFieldsInput {
  capabilities: StudioPlaygroundCapabilities;
  /** Surface-owned model controls; their presence counts as an extra field. */
  controls?: ReactNode;
  inputControls?: CrunInputControls;
  models?: readonly IModel[];
  referenceCount?: number;
  setup: GenerationSetup;
}

export interface GenerationSetupOutputMenuProps {
  capabilities: StudioPlaygroundCapabilities;
  /** Surface-owned model controls rendered after the shared output fields. */
  controls?: ReactNode;
  inputControls?: CrunInputControls;
  /** Catalog models, read for the selected model's clip lengths per resolution. */
  models?: readonly IModel[];
  onResetField: (key: GenerationSetupFieldKey) => void;
  onSetField: GenerationSetupFieldSetter;
  referenceCount?: number;
  section: GenerationSetupOutputSection;
  setup: GenerationSetup;
}

export interface GenerationSetupBrandSectionProps {
  capabilities: StudioPlaygroundCapabilities;
  showEnhancementSettings?: boolean;
  onResetField: (key: GenerationSetupFieldKey) => void;
  onSetField: GenerationSetupFieldSetter;
  reasons: Partial<Record<GenerationSetupFieldKey, string>>;
  setup: GenerationSetup;
}

export interface GenerationSetupSavePresetRowProps {
  isDisabled?: boolean;
  onSavePreset: (label: string) => void;
}

/** The Type chip (with its Edit toggle) and the Auto / Advanced button, inline in the bar. */
export interface GenerationSetupTypeBarProps {
  advancedMode?: GenerationSetupAdvancedMode;
  /** Studio's explicit image editing override; other surfaces omit it. */
  imageEditing?: GenerationSetupImageEditingMode;
  isDisabled?: boolean;
  onTypeChange?: (type: GenerationSetupType) => void;
  setup: GenerationSetup;
  /** Omitted (or a single entry) on surfaces that lock the type. */
  typeOptions: readonly GenerationSetupTypeOption[];
}
