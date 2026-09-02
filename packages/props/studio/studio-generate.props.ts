import type { ViewType } from '@genfeedai/contracts';
import type { IIngredient, IModel } from '@genfeedai/contracts/interfaces';
import type {
  StudioGenerateJob,
  StudioGenerateSettings,
  StudioGenerateType,
} from '@genfeedai/contracts/interfaces/studio/studio-generate.interface';
import type { PromptBarAttachedAsset } from '@genfeedai/props/studio/prompt-bar.props';
import type { AnyExtension, JSONContent } from '@tiptap/core';

/** Results-grid filter: one asset type, or every type at once. */
export type StudioGenerateFilter = StudioGenerateType | 'all';

export type StudioGenerateReferenceRole =
  | 'reference'
  | 'startFrame'
  | 'endFrame'
  | 'videoReference';

export interface StudioGenerateSettingsPopoverProps {
  isDisabled?: boolean;
  onChange: (patch: Partial<StudioGenerateSettings>) => void;
  onReset: () => void;
  settings: StudioGenerateSettings;
  type: StudioGenerateType;
}

export interface StudioIdentityFieldsProps {
  isDisabled?: boolean;
  onChange: (patch: Partial<StudioGenerateSettings>) => void;
  settings: StudioGenerateSettings;
  type: StudioGenerateType;
}

export interface StudioGenerateComposerProps {
  attachedAssets: PromptBarAttachedAsset[];
  extraExtensions?: readonly AnyExtension[];
  isDragActive?: boolean;
  isGenerating: boolean;
  isListening: boolean;
  isLoadingModels: boolean;
  isTranscribing: boolean;
  isUploading: boolean;
  models: readonly IModel[];
  onAddFiles: (files: File[], role?: StudioGenerateReferenceRole) => void;
  onOpenLibrary: (role?: StudioGenerateReferenceRole) => void;
  onPromptChange: (value: string) => void;
  onPromptDocumentChange?: (document: JSONContent) => void;
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
  onRemoveGeneration: (job: StudioGenerateJob) => void;
  onSeeDetails: (ingredient: IIngredient) => void;
  onToggleFavorite: (ingredient: IIngredient) => void | Promise<void>;
  onUseAsVideoReference: (ingredient: IIngredient) => void;
}

export interface StudioGenerateResultsProps {
  assetActions: StudioGenerateAssetActions;
  isLoading: boolean;
  jobs: readonly StudioGenerateJob[];
  onReprompt: (job: StudioGenerateJob) => void;
  onSelect: (job: StudioGenerateJob) => void;
  selectedJobId?: string | null;
  view: ViewType.GRID | ViewType.LIST;
}

export interface StudioGenerateCardProps {
  assetActions: StudioGenerateAssetActions;
  isSelected?: boolean;
  job: StudioGenerateJob;
  onReprompt: (job: StudioGenerateJob) => void;
  onSelect: (job: StudioGenerateJob) => void;
  view: ViewType.GRID | ViewType.LIST;
}

export interface StudioGenerateInspectorProps {
  job: StudioGenerateJob;
  onClose: () => void;
  onSelect: (job: StudioGenerateJob) => void;
  onVary: (job: StudioGenerateJob) => void;
  runJobs: readonly StudioGenerateJob[];
}
