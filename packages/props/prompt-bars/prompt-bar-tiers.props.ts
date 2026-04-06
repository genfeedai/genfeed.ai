import type { PromptTextareaSchema } from '@genfeedai/client/schemas';
import type {
  IngredientCategory,
  IngredientFormat,
  ModelCategory,
  ModelKey,
  QualityTier,
  SubscriptionTier,
} from '@genfeedai/enums';
import type {
  IAsset,
  IElementBlacklist,
  IElementCamera,
  IElementCameraMovement,
  IElementLens,
  IElementLighting,
  IElementMood,
  IElementScene,
  IElementStyle,
  IFolder,
  IFontFamily,
  IImage,
  IModel,
  IPreset,
  ISound,
  ITraining,
} from '@genfeedai/interfaces';
import type { IGenerationItem } from '@genfeedai/interfaces/components/generation.interface';
import type { FormDropdownOption } from '@props/forms/form.props';
import type { PromptBarSuggestionItem } from '@props/prompt-bars/prompt-bar-suggestion-item.props';
import type {
  GalleryModalOptions,
  PromptBarConfig,
  UploadModalOptions,
} from '@props/studio/prompt-bar.props';
import type {
  Dispatch,
  FormEvent,
  ReactNode,
  RefObject,
  SetStateAction,
} from 'react';
import type {
  Path,
  UseFormRegisterReturn,
  UseFormReturn,
} from 'react-hook-form';

/**
 * Props for PromptBarEssentials — the always-visible tier.
 * Contains: model selector, format/aspect ratio, duration, prompt textarea, generate button.
 */
export interface PromptBarEssentialsProps {
  currentConfig: PromptBarConfig;
  pathname: string;
  categoryType?: IngredientCategory;
  currentModelCategory?: ModelCategory | null;
  shellMode?: 'legacy-collapsible' | 'studio-unified';

  form: UseFormReturn<PromptTextareaSchema>;
  isDisabledState: boolean;
  isGenerateBlocked: boolean;
  controlClass: string;
  iconButtonClass: string;

  isAdvancedMode: boolean;
  isAdvancedControlsEnabled: boolean;
  isAutoMode: boolean;
  setIsAutoMode: Dispatch<SetStateAction<boolean>>;

  models: IModel[];
  trainings: ITraining[];
  selectedModels: IModel[];
  trainingIds: Set<string>;
  normalizedWatchedModels: string[];
  watchedModels: string[];
  watchedModel: ModelKey;
  watchedFormat: IngredientFormat;
  watchedDuration?: number;
  watchedQuality: QualityTier | undefined;
  subscriptionTier?: SubscriptionTier;
  isModelNotSet: boolean;

  hasModelWithoutDurationEditingValue: boolean;

  formatIcon: ReactNode;
  videoDurations: number[];

  references: (IAsset | IImage)[];
  referenceSource: 'brand' | 'ingredient' | '';
  setReferences: Dispatch<SetStateAction<(IAsset | IImage)[]>>;
  setReferenceSource: Dispatch<SetStateAction<'' | 'brand' | 'ingredient'>>;
  folders?: IFolder[];

  triggerConfigChange: () => void;
  handleTextareaChange: () => void;
  onTextChange?: (text: string) => void;
  onToggleQuickOptions: () => void;
  isQuickOptionsOpen: boolean;
  handleCopy: (text: string) => Promise<void>;
  enhancePrompt: () => Promise<void>;
  handleUndo: () => void;
  handleSubmitForm: (e?: FormEvent<HTMLFormElement>) => void;
  onOpenAdvanced?: () => void;
  onToggleCollapse?: () => void;
  secondaryContent?: ReactNode;
  suggestions?: PromptBarSuggestionItem[];
  onSuggestionSelect?: (item: PromptBarSuggestionItem) => void;
  showSuggestionsWhenEmpty?: boolean;
  maxSuggestions?: number;

  textareaRef: RefObject<HTMLTextAreaElement | null>;
  textareaRegister: UseFormRegisterReturn<Path<PromptTextareaSchema>>;
  modelDropdownRef: RefObject<HTMLButtonElement | null>;
  promptBarHeight: number;

  getModelDefaultDuration: (modelKey: ModelKey) => number | undefined;
  getDefaultVideoResolution: (
    modelKey: ModelKey | string,
  ) => string | undefined;
  getMinFromAllModels: (getter: (modelKey: ModelKey) => number) => number;
  getModelMaxOutputs: (modelKey: ModelKey) => number;

  setTextValue: Dispatch<SetStateAction<string>>;

  isSupported: boolean;
  toggleVoice: () => void;
  isRecording: boolean;
  isProcessing: boolean;

  isGenerating: boolean;
  isEnhancing: boolean;
  isGenerateDisabled: boolean;
  previousPrompt: string | null;
  selectedModelCost: number;
  activeGenerations: IGenerationItem[];
  generateLabel: string;

  avatars?: FormDropdownOption[];
  voices?: FormDropdownOption[];
}

/**
 * Props for PromptBarQuickOptions — the collapsible second tier.
 * Contains: folder selector, output count, audio toggle, reference images.
 */
export interface PromptBarQuickOptionsProps {
  currentConfig: PromptBarConfig;
  pathname: string;
  categoryType?: IngredientCategory;
  currentModelCategory?: ModelCategory | null;

  form: UseFormReturn<PromptTextareaSchema>;
  isDisabledState: boolean;
  controlClass: string;
  iconButtonClass: string;

  isAdvancedControlsEnabled: boolean;
  normalizedWatchedModels: string[];
  watchedFormat: IngredientFormat;
  watchedWidth?: number;
  watchedHeight?: number;

  hasAudioToggleValue: boolean;
  hasEndFrameValue: boolean;
  hasAnyImagenModelValue: boolean;
  isOnlyImagenModelsValue: boolean;
  supportsInterpolation: boolean;
  supportsMultipleReferences: boolean;
  requiresReferences: boolean;
  maxReferenceCount: number;

  folders?: IFolder[];

  references: (IAsset | IImage)[];
  setReferences: Dispatch<SetStateAction<(IAsset | IImage)[]>>;
  endFrame: IAsset | IImage | null;
  setEndFrame: Dispatch<SetStateAction<IAsset | IImage | null>>;
  referenceSource: 'brand' | 'ingredient' | '';
  setReferenceSource: Dispatch<SetStateAction<'brand' | 'ingredient' | ''>>;

  triggerConfigChange: () => void;

  openGallery: (options: GalleryModalOptions) => void;
  openUpload: (options: UploadModalOptions) => void;

  isExpanded?: boolean;
  onToggleExpanded?: () => void;
  showToggle?: boolean;
  onOpenAdvanced?: () => void;
  inlineContent?: ReactNode;
}

/**
 * Props for PromptBarAdvanced — the modal/drawer third tier.
 * Contains: all metadata selectors, tags, sounds, blacklists.
 */
export interface PromptBarAdvancedProps {
  currentConfig: PromptBarConfig;
  pathname: string;
  categoryType?: IngredientCategory;

  form: UseFormReturn<PromptTextareaSchema>;
  isDisabledState: boolean;
  controlClass: string;

  isAdvancedControlsEnabled: boolean;

  profiles?: Array<{ id: string; name: string; description?: string }>;
  filteredPresets: IPreset[];
  filteredScenes: IElementScene[];
  filteredFontFamilies: IFontFamily[];
  filteredStyles: IElementStyle[];
  filteredCameras: IElementCamera[];
  filteredLightings: IElementLighting[];
  filteredLenses: IElementLens[];
  filteredCameraMovements: IElementCameraMovement[];
  filteredMoods: IElementMood[];
  filteredSounds: ISound[];
  filteredBlacklists: IElementBlacklist[];

  selectedPreset: string;
  setSelectedPreset: Dispatch<SetStateAction<string>>;
  selectedProfile: string;
  setSelectedProfile: Dispatch<SetStateAction<string>>;

  refocusTextarea: () => void;
  onTextChange?: (text: string) => void;
  triggerConfigChange: () => void;

  isOpen: boolean;
  onClose: () => void;
}
