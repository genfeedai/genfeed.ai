import type { IModel } from '@genfeedai/interfaces';
import type {
  StudioGenerateJob,
  StudioGenerateSettings,
  StudioGenerateType,
} from '@genfeedai/interfaces/studio/studio-generate.interface';
import type { PromptBarAttachedAsset } from '@genfeedai/props/studio/prompt-bar.props';

/** Results-grid filter: one asset type, or every type at once. */
export type StudioGenerateFilter = StudioGenerateType | 'all';

export interface StudioGenerateTypeSelectorProps {
  isDisabled?: boolean;
  onChange: (type: StudioGenerateType) => void;
  type: StudioGenerateType;
}

export interface StudioGenerateSettingsPopoverProps {
  isDisabled?: boolean;
  onChange: (patch: Partial<StudioGenerateSettings>) => void;
  onReset: () => void;
  settings: StudioGenerateSettings;
  type: StudioGenerateType;
}

export interface StudioGenerateComposerProps {
  attachedAssets: PromptBarAttachedAsset[];
  isDragActive?: boolean;
  isGenerating: boolean;
  isListening: boolean;
  isLoadingModels: boolean;
  isTranscribing: boolean;
  isUploading: boolean;
  models: readonly IModel[];
  onAddFiles: (files: File[]) => void;
  onOpenLibrary: () => void;
  onPromptChange: (value: string) => void;
  onRemoveAttachedAsset: (assetId: string) => void;
  onResetSettings: () => void;
  onSettingsChange: (patch: Partial<StudioGenerateSettings>) => void;
  onStartListening: () => void;
  onStopListening: () => void;
  onSubmit: () => void;
  onTypeChange: (type: StudioGenerateType) => void;
  prompt: string;
  settings: StudioGenerateSettings;
  shouldShowVoiceInput: boolean;
  type: StudioGenerateType;
}

export interface StudioGenerateResultsProps {
  isLoading: boolean;
  jobs: readonly StudioGenerateJob[];
  onReprompt: (job: StudioGenerateJob) => void;
}

export interface StudioGenerateCardProps {
  job: StudioGenerateJob;
  onReprompt: (job: StudioGenerateJob) => void;
}
