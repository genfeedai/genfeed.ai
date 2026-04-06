import type { PromptTextareaSchema } from '@genfeedai/client/schemas';
import type {
  IngredientCategory,
  IngredientFormat,
  ModelCategory,
  QualityTier,
  SubscriptionTier,
} from '@genfeedai/enums';
import type {
  IAsset,
  IEditFormData,
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
  IIngredient,
  IModel,
  IPreset,
  ISound,
  ITag,
  ITraining,
} from '@genfeedai/interfaces';
import type { IGenerationItem } from '@genfeedai/interfaces/components/generation.interface';
import type { FormDropdownOption } from '@props/forms/form.props';
import type { PromptBarSuggestionItem } from '@props/prompt-bars/prompt-bar-suggestion-item.props';
import type { PromptsService } from '@services/content/prompts.service';
import type {
  Dispatch,
  DragEvent,
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

export interface PromptBarProps {
  models?: IModel[];
  trainings?: ITraining[];
  presets?: IPreset[];
  folders?: IFolder[];
  profiles?: Array<{ id: string; name: string; description?: string }>;
  moods?: IElementMood[];
  styles?: IElementStyle[];
  cameras?: IElementCamera[];
  scenes?: IElementScene[];
  fontFamilies?: IFontFamily[];
  blacklists?: IElementBlacklist[];
  sounds?: ISound[];
  tags?: ITag[];
  lightings?: IElementLighting[];
  lenses?: IElementLens[];
  cameraMovements?: IElementCameraMovement[];
  avatars?: FormDropdownOption[];
  voices?: FormDropdownOption[];
  avatarPreviewUrl?: string;

  categoryType?: IngredientCategory;
  onIngredientCategoryChange?: (category: IngredientCategory) => void;

  isDisabled?: boolean;
  isGenerating?: boolean;
  isGenerateDisabled?: boolean;
  generateLabel?: string;
  cost?: number;
  externalFormat?: string;
  externalWidth?: number;
  externalHeight?: number;
  promptData?: Partial<PromptTextareaSchema> & { isValid: boolean };

  onSubmit?: () => void;
  onDatasetChange?: (
    data: Partial<PromptTextareaSchema> & {
      isValid: boolean;
    },
  ) => void;

  promptText?: string;
  onTextChange?: (text: string) => void;
  promptConfig?: Partial<Omit<PromptTextareaSchema, 'text'>> & {
    isValid: boolean;
  };
  onConfigChange?: (
    config: Partial<Omit<PromptTextareaSchema, 'text'>> & { isValid: boolean },
  ) => void;
  shellMode?: 'legacy-collapsible' | 'studio-unified';
  suggestions?: PromptBarSuggestionItem[];
  onSuggestionSelect?: (item: PromptBarSuggestionItem) => void;
  showSuggestionsWhenEmpty?: boolean;
  maxSuggestions?: number;

  mode?: 'generate' | 'edit';
  form?: UseFormReturn<IEditFormData>;
  isProcessing?: boolean;
  selectedIngredient?: IIngredient | null;
  currentAssetFormat?: IngredientFormat;
}

export interface PromptBarModelControlsProps {
  isAdvancedMode: boolean;
  hasModelButton: boolean;
  models: IModel[];
  trainings: Array<{ id?: string | null }>;
  trainingIds: Set<string>;
  watchedFormat: IngredientFormat;
  normalizedWatchedModels: string[];
  selectedModels: IModel[];
  watchedModels: string[];
  modelDropdownRef: RefObject<HTMLButtonElement | null>;
  promptBarHeight: number;
  isModelNotSet: boolean;
  controlClass: string;
  form: UseFormReturn<PromptTextareaSchema>;
  getModelDefaultDuration: (modelKey: string) => number | undefined;
  getDefaultVideoResolution: (modelKey: string | string) => string | undefined;
  triggerConfigChange: () => void;
  currentModelCategory?: ModelCategory | null;
}

export interface PromptBarQualityControlsProps {
  watchedQuality: QualityTier | undefined;
  controlClass: string;
  isDisabled: boolean;
  form: UseFormReturn<PromptTextareaSchema>;
  triggerConfigChange: () => void;
  subscriptionTier?: SubscriptionTier;
}

export interface PromptBarConfig {
  buttons?: {
    presets?: boolean;
    model?: boolean;
    format?: boolean;
    style?: boolean;
    camera?: boolean;
    mood?: boolean;
    scene?: boolean;
    reference?: boolean;
    fontFamily?: boolean;
    tags?: boolean;
    upload?: boolean;
    gallery?: boolean;
    sounds?: boolean;
    blacklist?: boolean;
    avatar?: boolean;
    voice?: boolean;
  };
  placeholder?: string;
  defaultModel?: string;
}

export interface PromptBarFormatControlsProps {
  currentConfig: PromptBarConfig;
  formatIcon: ReactNode;
  form: UseFormReturn<PromptTextareaSchema>;
  normalizedWatchedModels: string[];
  watchedModel: string;
  references: (IAsset | IImage)[];
  setReferences: Dispatch<SetStateAction<(IAsset | IImage)[]>>;
  setReferenceSource: Dispatch<SetStateAction<'' | 'brand' | 'ingredient'>>;
  triggerConfigChange: () => void;
  isDisabledState: boolean;
  controlClass: string;
}

export interface PromptAdvancedSettingsProps {
  onResolutionChange?: (resolution: string) => void;
  onSeedChange?: (seed: number | undefined) => void;
  defaultResolution?: string;
  defaultSeed?: number;
  showResolution?: boolean;
  showSeed?: boolean;
  isDisabled?: boolean;
}

export interface PromptSuggestion {
  label: string;
  value: string;
  category: 'style' | 'camera' | 'mood' | 'general';
}

export interface PromptSuggestionsProps {
  model: string;
  style: string;
  onSuggestionClick: (suggestion: string) => void;
  isVisible?: boolean;
  onClose?: () => void;
}

export interface PromptTextareaProps {
  form: UseFormReturn<PromptTextareaSchema>;
  isDisabled?: boolean;
  showCaptionToggle?: boolean;
  promptType?: string;
  placeholder?: string;
  className?: string;
}

export interface GalleryModalOptions {
  category: IngredientCategory;
  title?: string;
  format?: IngredientFormat | string;
  onSelect: (asset: IAsset | IImage | (IAsset | IImage)[]) => void;
  onSelectAccountReference?: (assets: IAsset[]) => void;
  selectedReferences?: string[];
  maxSelectableItems?: number;
  selectedId?: string;
  isNoneAllowed?: boolean;
  accountReference?: IAsset | null;
}

export interface UploadModalOptions {
  category: IngredientCategory | string;
  parentId?: string;
  parentModel?: string;
  width?: number;
  height?: number;
  isResizeEnabled?: boolean;
  isMultiple?: boolean;
  maxFiles?: number;
  initialFiles?: File[];
  autoSubmit?: boolean;
  onConfirm?: (ingredient?: IIngredient | IAsset) => void;
  onComplete?: (ingredients: (IIngredient | IAsset)[]) => void;
}

export interface PromptBarAttachedAsset {
  id: string;
  kind: 'image' | 'video' | 'audio';
  source: 'upload' | 'library';
  role: 'reference' | 'startFrame' | 'endFrame' | 'input';
  previewUrl?: string;
  name?: string;
}

export interface PromptBarFrameControlsProps {
  hasEndFrame: boolean;
  hasInterpolation: boolean;
  supportsMultipleReferences: boolean;
  requiresReferences: boolean;
  maxReferenceCount: number;
  isVideoModel: boolean;
  hasAnyImagenModel: boolean;

  references: (IAsset | IImage)[];
  endFrame: IAsset | IImage | null;
  referenceSource: 'brand' | 'ingredient' | '';

  onReferencesChange: (refs: (IAsset | IImage)[]) => void;
  onReferenceSourceChange: (source: 'brand' | 'ingredient' | '') => void;
  onEndFrameChange: (frame: IAsset | IImage | null) => void;
  openGallery: (options: GalleryModalOptions) => void;
  openUpload: (options: UploadModalOptions) => void;

  form: UseFormReturn<PromptTextareaSchema>;
  watchedFormat: IngredientFormat;
  watchedWidth?: number;
  watchedHeight?: number;

  disabled: boolean;
  iconButtonClass: string;

  showReference?: boolean;

  triggerConfigChange: () => void;
}

export interface UsePromptBarFormOptions {
  promptData?: Partial<PromptTextareaSchema> & { isValid: boolean };
}

/**
 * Return type for usePromptBarForm hook
 */
export interface UsePromptBarFormReturn {
  form: UseFormReturn<PromptTextareaSchema>;
  currentFormat: IngredientFormat;
}

/**
 * Options for usePromptBarModels hook
 */
export interface UsePromptBarModelsOptions {
  models: IModel[];
  trainings: ITraining[];
  normalizedWatchedModels: string[];
  watchedModel: string;
}

/**
 * Return type for usePromptBarModels hook
 */
export interface UsePromptBarModelsReturn {
  trainingIds: Set<string>;
  selectedModels: IModel[];
  hasAnyModel: (predicate: (modelKey: string) => boolean) => boolean;
  getUnionFromAllModels: <T extends number | string>(
    getter: (modelKey: string) => T[],
  ) => T[];
  getMinFromAllModels: (getter: (modelKey: string) => number) => number;
  supportsMultipleReferences: boolean;
  requiresReferences: boolean;
  maxReferenceCount: number;
  isOnlyImagenModels: boolean;
  hasAnyImagenModel: boolean;
  hasSpeech: boolean;
  hasEndFrame: boolean;
  supportsInterpolation: boolean;
  hasAudioToggle: boolean;
  hasModelWithoutDurationEditing: boolean;
  hasAnyResolutionOptions: boolean;
}

/**
 * Options for usePromptBarPricing hook
 */
export interface UsePromptBarPricingOptions {
  selectedModels: IModel[];
  watchedWidth?: number;
  watchedHeight?: number;
  watchedDuration?: number;
  watchedOutputs?: number;
}

/**
 * Return type for usePromptBarPricing hook
 */
export interface UsePromptBarPricingReturn {
  calculateModelCost: (
    model: IModel,
    width: number,
    height: number,
    duration: number,
  ) => number;
  selectedModelCost: number;
}

/**
 * Options for usePromptBarFilters hook
 */
export interface UsePromptBarFiltersOptions {
  styles: IElementStyle[];
  moods: IElementMood[];
  cameras: IElementCamera[];
  scenes: IElementScene[];
  lightings: IElementLighting[];
  lenses: IElementLens[];
  cameraMovements: IElementCameraMovement[];
  fontFamilies: IFontFamily[];
  presets: IPreset[];
  blacklists: IElementBlacklist[];
  sounds: ISound[];
  currentModelCategory?: ModelCategory | null;
  normalizedWatchedModels: string[];
}

/**
 * Return type for usePromptBarFilters hook
 */
export interface UsePromptBarFiltersReturn {
  filteredStyles: IElementStyle[];
  filteredMoods: IElementMood[];
  filteredCameras: IElementCamera[];
  filteredScenes: IElementScene[];
  filteredLightings: IElementLighting[];
  filteredLenses: IElementLens[];
  filteredCameraMovements: IElementCameraMovement[];
  filteredFontFamilies: IFontFamily[];
  filteredPresets: IPreset[];
  filteredBlacklists: IElementBlacklist[];
  filteredSounds: ISound[];
}

/**
 * Options for usePromptBarReferences hook
 */
export interface UsePromptBarReferencesOptions {
  form: UseFormReturn<PromptTextareaSchema>;
  selectedBrand?: { references?: Array<{ id: string }> } | null;
  supportsMultipleReferences: boolean;
  maxReferenceCount: number;
  currentModelCategory?: ModelCategory | null;
  currentFormat: IngredientFormat;
  notificationsService: {
    warning: (message: string, duration?: number) => void;
    error: (message: string) => void;
  };
}

/**
 * Return type for usePromptBarReferences hook
 */
export interface UsePromptBarReferencesReturn {
  references: (IAsset | IImage)[];
  setReferences: Dispatch<SetStateAction<(IAsset | IImage)[]>>;
  endFrame: IAsset | IImage | null;
  setEndFrame: Dispatch<SetStateAction<IAsset | IImage | null>>;
  referenceSource: 'brand' | 'ingredient' | '';
  setReferenceSource: Dispatch<SetStateAction<'brand' | 'ingredient' | ''>>;
  handleReferenceSelect: (
    selection: IAsset | IAsset[] | IImage | IImage[] | null,
  ) => void;
  handleSelectAccountReference: (assets: { id: string; url: string }[]) => void;
  isUserSelectingReferencesRef: RefObject<boolean>;
  hasInitializedReferencesRef: RefObject<boolean>;
}

/**
 * Options for usePromptBarSync hook
 */
export interface UsePromptBarSyncOptions {
  form: UseFormReturn<PromptTextareaSchema>;
  useSplitState: boolean;
  onTextChange?: (text: string) => void;
  onConfigChange?: (
    config: Partial<Omit<PromptTextareaSchema, 'text'>> & { isValid: boolean },
  ) => void;
  onDatasetChange?: (
    data: Partial<PromptTextareaSchema> & { isValid: boolean },
  ) => void;
  promptData?: Partial<PromptTextareaSchema> & { isValid: boolean };
  promptConfig?: Partial<Omit<PromptTextareaSchema, 'text'>> & {
    isValid: boolean;
  };
  promptText?: string;
  externalFormat?: string;
  externalWidth?: number;
  externalHeight?: number;
  categoryType?: IngredientCategory;
  models?: IModel[];
  references: (IAsset | IImage)[];
  referenceSource: 'brand' | 'ingredient' | '';
  isUserSelectingReferencesRef: RefObject<boolean>;
  setReferences: Dispatch<SetStateAction<(IAsset | IImage)[]>>;
  setReferenceSource: Dispatch<SetStateAction<'brand' | 'ingredient' | ''>>;
  hasInitializedReferencesRef: RefObject<boolean>;
}

/**
 * Return type for usePromptBarSync hook
 */
export interface UsePromptBarSyncReturn {
  handleTextChange: () => void;
  handleTextareaChange: () => void;
  triggerConfigChange: () => void;
  flushConfigChange: () => void;
  isExternalUpdateRef: RefObject<boolean>;
  lastPromptDataRef: RefObject<
    (Partial<PromptTextareaSchema> & { isValid: boolean }) | undefined
  >;
  lastPromptConfigRef: RefObject<
    | (Partial<Omit<PromptTextareaSchema, 'text'>> & { isValid: boolean })
    | undefined
  >;
  hasReferencesEffectInitializedRef: RefObject<boolean>;
  textValueDebounceTimerRef: RefObject<NodeJS.Timeout | null>;
  debounceTimerRef: RefObject<NodeJS.Timeout | null>;
  onConfigChangeRef: RefObject<
    | ((
        config: Partial<Omit<PromptTextareaSchema, 'text'>> & {
          isValid: boolean;
        },
      ) => void)
    | undefined
  >;
  onDatasetChangeRef: RefObject<
    | ((data: Partial<PromptTextareaSchema> & { isValid: boolean }) => void)
    | undefined
  >;
  setTextValue: Dispatch<SetStateAction<string>>;
}

/**
 * Options for usePromptBarEnhancement hook
 */
export interface UsePromptBarEnhancementOptions {
  form: UseFormReturn<PromptTextareaSchema>;
  watchedModel: string;
  organizationId: string;
  brandId: string;
  selectedProfile: string;
  getPromptsService: () => Promise<PromptsService>;
  subscribe: (
    event: string,
    handler: (...args: unknown[]) => void,
  ) => () => void;
  notificationsService: {
    info: (message: string) => void;
    error: (message: string) => void;
  };
  clipboardService: {
    copyToClipboard: (text: string) => Promise<void>;
  };
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  resizeTextarea: (textarea: HTMLTextAreaElement | null) => void;
  setTextValue: Dispatch<SetStateAction<string>>;
}

/**
 * Return type for usePromptBarEnhancement hook
 */
export interface UsePromptBarEnhancementReturn {
  isEnhancing: boolean;
  previousPrompt: string | null;
  enhancePrompt: () => Promise<void>;
  handleUndo: () => void;
  handleCopy: (text: string) => Promise<void>;
  socketSubscriptionsRef: RefObject<Array<() => void>>;
  timeoutRefsRef: RefObject<Array<NodeJS.Timeout>>;
}

/**
 * Props for PromptBarFolderSelector component
 */
export interface PromptBarFolderSelectorProps {
  folders?: IFolder[];
  form: UseFormReturn<PromptTextareaSchema>;
  controlClass: string;
  isDisabled: boolean;
  triggerDisplay?: 'default' | 'icon-only';
}

/**
 * Props for PromptBarVariationPresets component
 */
export interface PromptBarVariationPresetsProps {
  shouldRender: boolean;
  form: UseFormReturn<PromptTextareaSchema>;
  setTextValue: Dispatch<SetStateAction<string>>;
}

export interface PromptBarExpandedViewProps {
  currentConfig: PromptBarConfig;
  pathname: string;
  categoryType?: IngredientCategory;
  currentModelCategory?: ModelCategory | null;

  form: UseFormReturn<PromptTextareaSchema>;
  isCollapsed: boolean;
  setIsCollapsed: Dispatch<SetStateAction<boolean>>;
  isAutoMode: boolean;
  setIsAutoMode: Dispatch<SetStateAction<boolean>>;

  isDisabledState: boolean;
  isGenerateBlocked: boolean;
  controlClass: string;
  iconButtonClass: string;

  isAdvancedMode: boolean;
  isAdvancedControlsEnabled: boolean;

  models: IModel[];
  trainings: ITraining[];
  selectedModels: IModel[];
  trainingIds: Set<string>;
  normalizedWatchedModels: string[];
  watchedModels: string[];
  watchedModel: string;
  watchedFormat: IngredientFormat;
  watchedWidth?: number;
  watchedHeight?: number;
  watchedDuration?: number;
  watchedSpeech?: string;
  watchedQuality: QualityTier | undefined;
  subscriptionTier?: SubscriptionTier;
  isModelNotSet: boolean;

  hasAudioToggleValue: boolean;
  hasSpeechValue: boolean;
  hasModelWithoutDurationEditingValue: boolean;
  hasAnyResolutionOptionsValue: boolean;
  hasEndFrameValue: boolean;
  hasAnyImagenModelValue: boolean;
  isOnlyImagenModelsValue: boolean;
  supportsInterpolation: boolean;
  supportsMultipleReferences: boolean;
  requiresReferences: boolean;
  maxReferenceCount: number;

  folders?: IFolder[];
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

  references: (IAsset | IImage)[];
  setReferences: Dispatch<SetStateAction<(IAsset | IImage)[]>>;
  endFrame: IAsset | IImage | null;
  setEndFrame: Dispatch<SetStateAction<IAsset | IImage | null>>;
  referenceSource: 'brand' | 'ingredient' | '';
  setReferenceSource: Dispatch<SetStateAction<'brand' | 'ingredient' | ''>>;

  selectedPreset: string;
  setSelectedPreset: Dispatch<SetStateAction<string>>;
  selectedProfile: string;
  setSelectedProfile: Dispatch<SetStateAction<string>>;

  formatIcon: ReactNode;

  videoDurations: number[];

  triggerConfigChange: () => void;
  refocusTextarea: () => void;
  handleTextareaChange: () => void;
  onTextChange?: (text: string) => void;
  handleCopy: (text: string) => Promise<void>;
  enhancePrompt: () => Promise<void>;
  handleUndo: () => void;
  handleSubmitForm: (e?: FormEvent<HTMLFormElement>) => void;
  suggestions?: PromptBarSuggestionItem[];
  onSuggestionSelect?: (item: PromptBarSuggestionItem) => void;
  showSuggestionsWhenEmpty?: boolean;
  maxSuggestions?: number;

  openGallery: (options: GalleryModalOptions) => void;
  openUpload: (options: UploadModalOptions) => void;
  isDragActive: boolean;
  dragError?: string | null;
  attachedPromptAssets: PromptBarAttachedAsset[];
  onDragEnter: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onDropFiles: (event: DragEvent<HTMLDivElement>) => Promise<void>;
  onRemoveAttachedAsset: (assetId: string) => void;
  onBrowseAssets: () => void;

  textareaRef: RefObject<HTMLTextAreaElement | null>;
  textareaRegister: UseFormRegisterReturn<Path<PromptTextareaSchema>>;
  modelDropdownRef: RefObject<HTMLButtonElement | null>;
  promptBarHeight: number;

  getModelDefaultDuration: (modelKey: string) => number | undefined;
  getDefaultVideoResolution: (modelKey: string | string) => string | undefined;
  getMinFromAllModels: (getter: (modelKey: string) => number) => number;
  getModelMaxOutputs: (modelKey: string) => number;

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

  /** For AVATAR category */
  avatars?: FormDropdownOption[];
  voices?: FormDropdownOption[];
}

export type PromptBarUnifiedViewProps = Omit<
  PromptBarExpandedViewProps,
  'isCollapsed' | 'setIsCollapsed'
>;
