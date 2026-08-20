import type { IIngredient, IModel } from '@genfeedai/interfaces';
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

export interface StudioGenerateAssetActions {
  onClickIngredient: (ingredient: IIngredient) => void;
  onConvertToVideo: (ingredient: IIngredient) => void;
  onCopyPrompt: (ingredient: IIngredient) => void | Promise<void>;
  onCreateVariation: (ingredient: IIngredient) => void;
  onDeleteIngredient: (ingredient: IIngredient) => void;
  onMarkArchived: (ingredient: IIngredient) => void | Promise<void>;
  onMarkRejected: (ingredient: IIngredient) => void | Promise<void>;
  onMarkValidated: (ingredient: IIngredient) => void | Promise<void>;
  onPublishIngredient: (ingredient: IIngredient) => void;
  onRefresh: () => void;
  onSeeDetails: (ingredient: IIngredient) => void;
  onToggleFavorite: (ingredient: IIngredient) => void | Promise<void>;
  onUseAsVideoReference: (ingredient: IIngredient) => void;
}

export interface StudioGenerateResultsProps {
  assetActions: StudioGenerateAssetActions;
  isLoading: boolean;
  jobs: readonly StudioGenerateJob[];
  onReprompt: (job: StudioGenerateJob) => void;
}

export interface StudioGenerateCardProps {
  assetActions: StudioGenerateAssetActions;
  job: StudioGenerateJob;
  onReprompt: (job: StudioGenerateJob) => void;
}
