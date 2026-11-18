import type {
  CrunInputControls,
  IModel,
} from '@genfeedai/contracts/interfaces';
import type {
  StudioPlaygroundCapabilities,
  StudioPlaygroundReferenceRole,
  StudioPlaygroundSettings,
  StudioPlaygroundType,
} from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';
import type { PromptBarAttachedAsset } from '@genfeedai/props/studio/prompt-bar.props';

export type StudioSettingsPatchHandler = (
  patch: Partial<StudioPlaygroundSettings>,
) => void;

export interface StudioComposerValidationInput {
  attachedAssets: readonly PromptBarAttachedAsset[];
  capabilities: StudioPlaygroundCapabilities;
  /** `mediaKind` of the selected Crun model's input controls, when it has any. */
  inputMediaKind: CrunInputControls['mediaKind'] | undefined;
  isAutoMode: boolean;
  isLoadingModels: boolean;
  models: readonly IModel[];
  selectedModel: IModel | undefined;
  settings: StudioPlaygroundSettings;
  type: StudioPlaygroundType;
}

/** Why Generate waits, derived from the settings and the attached references. */
export interface StudioComposerValidation {
  audioReferences: readonly PromptBarAttachedAsset[];
  editSourceLimit: number;
  editSources: readonly PromptBarAttachedAsset[];
  hasEditMask: boolean;
  isAudioReferenceInvalid: boolean;
  isAwaitingModels: boolean;
  isEditingModelUnavailable: boolean;
  isEditSourceMissing: boolean;
  isFirstFrameMissing: boolean;
  isIdentityMissing: boolean;
  isKling4KReferenceInvalid: boolean;
  isReferenceCombinationInvalid: boolean;
}

interface StudioReferenceSourceLabels {
  audioReference: string;
  editMask: string;
  editSources: string;
  endFrame: string;
  reference: string;
  startFrame: string;
  videoReference: string;
}

export interface StudioReferenceSourcesInput {
  audioReferenceCount: number;
  capabilities: StudioPlaygroundCapabilities;
  editSourceCount: number;
  editSourceLimit: number;
  /** `mediaKind` of the selected Crun model's input controls, when it has any. */
  inputMediaKind: CrunInputControls['mediaKind'] | undefined;
  /** The Crun video contract accepts a start and an end frame. */
  isCrunStartEnd: boolean;
  isAutoMode: boolean;
  isFlux: boolean;
  isUploading: boolean;
  labels: StudioReferenceSourceLabels;
  modelKey: string;
  onAddFiles: (files: File[], role?: StudioPlaygroundReferenceRole) => void;
  onOpenLibrary: (role?: StudioPlaygroundReferenceRole) => void;
  type: StudioPlaygroundType;
}

export interface StudioComposerOutputControlsProps {
  crunEndFrameId?: string;
  crunReferenceCount?: number;
  crunStartFrameId?: string;
  inputControls: CrunInputControls | undefined;
  isUploading: boolean;
  onSettingsChange: StudioSettingsPatchHandler;
  prompt: string;
  settings: StudioPlaygroundSettings;
}

export interface StudioComposerImageControlsProps {
  droppedEditingControls: boolean;
  editSourceLimit: number;
  editSources: readonly PromptBarAttachedAsset[];
  hasEditMask: boolean;
  isEditingModelUnavailable: boolean;
  isEditSourceMissing: boolean;
  isFlux: boolean;
  onSettingsChange: StudioSettingsPatchHandler;
  settings: StudioPlaygroundSettings;
  type: StudioPlaygroundType;
}

export interface StudioComposerReferenceNoticeProps {
  isAudioReferenceInvalid: boolean;
  isFirstFrameMissing: boolean;
  isKling4KReferenceInvalid: boolean;
  isReferenceCombinationInvalid: boolean;
}
