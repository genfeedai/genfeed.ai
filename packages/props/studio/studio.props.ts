import type { PromptTextareaSchema } from '@genfeedai/client/schemas';
import type {
  AssetScope,
  ComponentSize,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/enums';
import type {
  IElementBlacklist,
  IElementCamera,
  IElementMood,
  IElementScene,
  IElementStyle,
  IFontFamily,
  IIngredient,
  IModel,
  IPreset,
  ISound,
  ITag,
  ITraining,
  ITrainingConfig,
} from '@genfeedai/interfaces';
import type { FormEvent, ReactNode, RefObject } from 'react';

export interface StudioLayoutProps {
  children:
    | ReactNode
    | ((
        promptData: PromptTextareaSchema & {
          isValid: boolean;
        },
      ) => ReactNode);
  onGenerateSubmit: (
    data: PromptTextareaSchema & {
      isValid: boolean;
    },
  ) => void;
  isGenerating?: boolean;
  generateLabel?: string;
  cost?: number;
  models?: IModel[];
  presets?: IPreset[];
  moods?: IElementMood[];
  styles?: IElementStyle[];
  cameras?: IElementCamera[];
  scenes?: IElementScene[];
  fontFamilies?: IFontFamily[];
  blacklists?: IElementBlacklist[];
  sounds?: ISound[];
  tags?: ITag[];
  categoryType?: IngredientCategory;
  onIngredientCategoryChange?: (category: IngredientCategory) => void;
}

export interface StudioPageProps {
  children?: ReactNode;
  onSubmit: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  formRef?: RefObject<HTMLFormElement | null>;
  isGenerating?: boolean;
  isGenerateDisabled?: boolean;
  generateLabel?: string | ReactNode;
  cost: number;
  topbar?: ReactNode;
  preview?: ReactNode;
  keyboard?: ReactNode;
}

export interface StudioQuickActionsProps {
  selectedIngredient: IIngredient;
  availableTags?: ITag[];
  isLoadingTags?: boolean;
  isUpdatingTags?: boolean;
  onManageTags?: (ingredient: IIngredient) => void;
  onPublish?: (ingredient: IIngredient, platform: string) => void;
  onUpscale?: (ingredient: IIngredient) => void;
  onDelete?: (ingredient: IIngredient) => void;
  onClone?: (ingredient: IIngredient) => void;
  onReverse?: (ingredient: IIngredient) => void;
  onMirror?: (ingredient: IIngredient) => void;
  onTrim?: (ingredient: IIngredient) => void;
  onPortrait?: (ingredient: IIngredient) => void;
  onSquare?: (ingredient: IIngredient) => void;
  onLandscape?: (ingredient: IIngredient) => void;
  onConvertToGif?: (ingredient: IIngredient) => void;
  onConvertToVideo?: (ingredient: IIngredient) => void;
  onUseAsVideoReference?: (ingredient: IIngredient) => void;
  onCreateVariation?: (ingredient: IIngredient) => void;
  onDownload?: (
    ingredient: IIngredient,
  ) => undefined | Promise<undefined | Window | null | undefined>;
  onVote?: (ingredient: IIngredient) => void;
  onToggleFavorite?: (ingredient: IIngredient) => void;
  onGenerateCaptions?: (ingredient: IIngredient) => void;
  onAddTextOverlay?: (ingredient: IIngredient) => void;
  onMerge?: (ingredient: IIngredient) => void;
  onShowPrompt?: (ingredient: IIngredient) => void;
  onReprompt?: (ingredient: IIngredient) => void;
  onUsePrompt?: (ingredient: IIngredient) => void;
  onRefresh?: () => void;
  onShare?: (ingredient: IIngredient) => void;
  onCopy?: (ingredient: IIngredient) => void;
  onEdit?: (ingredient: IIngredient) => void;
  onMoreOptions?: (ingredient: IIngredient) => void;
  onSeeDetails?: (ingredient: IIngredient) => void;
  onConvertToPreset?: (ingredient: IIngredient) => void;
  onMarkValidated?: (ingredient: IIngredient) => void;
  onMarkArchived?: (ingredient: IIngredient) => void;
  onMarkRejected?: (ingredient: IIngredient) => void;
  onSetAsLogo?: (ingredient: IIngredient) => void;
  onSetAsBanner?: (ingredient: IIngredient) => void;
  onScopeChange?: (scope: AssetScope, updatedItem?: IIngredient) => void;
  isPublishing?: boolean;
  isUpscaling?: boolean;
  isDeleting?: boolean;
  isCloning?: boolean;
  isReversing?: boolean;
  isMirroring?: boolean;
  isTrimming?: boolean;
  isPortraiting?: boolean;
  isSquaring?: boolean;
  isLandscaping?: boolean;
  isConverting?: boolean;
  isConvertingToVideo?: boolean;
  isDownloading?: boolean;
  isVoting?: boolean;
  isTogglingFavorite?: boolean;
  isGeneratingCaptions?: boolean;
  isAddingTextOverlay?: boolean;
  isMerging?: boolean;
  isUsingPrompt?: boolean;
  isMarkingValidated?: boolean;
  isMarkingArchived?: boolean;
  isMarkingRejected?: boolean;
  isSettingAsLogo?: boolean;
  isSettingAsBanner?: boolean;
  size?: ComponentSize.SM | ComponentSize.MD | ComponentSize.LG;
  align?: 'start' | 'end';
  isSelected?: boolean;
  isMasonryCompact?: boolean;
}

export interface StudioEditDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

export interface StudioCanvasProps {
  children: ReactNode;
  ingredient?: IIngredient;
  onUpdate?: (ingredient: IIngredient) => void;
  className?: string;
}

export interface StudioTopbarProps {
  title?: string;
  onBack?: () => void;
  actions?: ReactNode;
}

export interface MediaTypeDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options?: Array<{ value: string; label: string }>;
}

export interface GenerationQueueProps {
  generations: Array<any>;
  onRemove?: (id: string) => void;
  onClose?: () => void;
}

export interface StudioTrainLayoutProps {
  children?: ReactNode;
  onTrain: (config: ITrainingConfig) => void;
  isProcessing: boolean;
  selectedImages: Set<string>;
  selectedParentImages: Set<string>;
  onImageSelect: (ingredient: IIngredient, isParent: boolean) => void;
  onClearSelection: () => void;
  images: IIngredient[];
  isLoading: boolean;
  categoryType: IngredientCategory;
  onIngredientCategoryChange: (category: IngredientCategory) => void;
  onUpload: () => void;
  processingTraining: ITraining | null;
  onDismissTraining: () => void;
}

export interface StudioTrainTopbarProps {
  selectedImages: Set<string>;
  onClearSelection: () => void;
  onBack?: () => void;
}

export interface StudioLayoutRef {
  resetForm: () => void;
  submitForm: () => void;
  getFormData: () => PromptTextareaSchema | null;
  setFormData: (data: Partial<PromptTextareaSchema>) => void;
  setPromptData: (data: Partial<PromptTextareaSchema>) => void;
  isFormValid: () => boolean;
}

export interface StudioGenerateContentProps {
  categoryType?: IngredientCategory;
  defaultCategoryType?: IngredientCategory;
  onIngredientCategoryChange?: (category: IngredientCategory) => void;
  models?: IModel[];
  presets?: IPreset[];
  moods?: IElementMood[];
  styles?: IElementStyle[];
  cameras?: IElementCamera[];
  scenes?: IElementScene[];
  fontFamilies?: IFontFamily[];
  blacklists?: IElementBlacklist[];
  sounds?: ISound[];
  tags?: ITag[];
  isGenerating?: boolean;
  onGenerate?: (data: PromptTextareaSchema) => void | Promise<void>;
  generateLabel?: string;
  cost?: number;
  className?: string;
}

export interface StudioGeneratePageProps {
  defaultCategoryType: IngredientCategory;
  onCategoryChange?: (category: IngredientCategory) => void;
}

export interface StudioSelectionActionsBarProps {
  count: number;
  onClear: () => void;
  onBulkDelete: () => void;
  onBulkStatusChange: (status: IngredientStatus) => void;
  isBulkUpdating?: boolean;
}
