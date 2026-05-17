'use client';

import type { PromptTextareaSchema } from '@genfeedai/client/schemas';
import type {
  IngredientCategory,
  IngredientFormat,
  ModelCategory,
  QualityTier,
  SubscriptionTier,
} from '@genfeedai/enums';
import type {
  FormDropdownOption as DropdownFieldOption,
  IAsset,
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
  ITraining,
} from '@genfeedai/interfaces';
import type { IGenerationItem } from '@genfeedai/interfaces/components/generation.interface';
import type { MediaConfig } from '@genfeedai/interfaces/ui/media-config.interface';
import type { PromptBarSuggestionItem } from '@genfeedai/props/prompt-bars/prompt-bar-suggestion-item.props';
import type {
  GalleryModalOptions,
  PromptBarAttachedAsset,
  PromptBarFeatures,
  UploadModalOptions,
} from '@genfeedai/props/studio/prompt-bar.props';
import {
  createContext,
  type Dispatch,
  type FormEvent,
  type ReactNode,
  type RefObject,
  type SetStateAction,
  useContext,
} from 'react';
import type {
  Path,
  UseFormRegisterReturn,
  UseFormReturn,
} from 'react-hook-form';

export interface PromptBarInternalContextValue {
  currentConfig: MediaConfig;
  pathname: string;
  categoryType?: IngredientCategory;
  currentModelCategory: ModelCategory | null;
  features: PromptBarFeatures;

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

  formatIcon: ReactNode;
  videoDurations: number[];

  references: (IAsset | IImage)[];
  setReferences: Dispatch<SetStateAction<(IAsset | IImage)[]>>;
  endFrame: IAsset | IImage | null;
  setEndFrame: Dispatch<SetStateAction<IAsset | IImage | null>>;
  referenceSource: 'brand' | 'ingredient' | '';
  setReferenceSource: Dispatch<SetStateAction<'' | 'brand' | 'ingredient'>>;

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

  selectedPreset: string;
  setSelectedPreset: Dispatch<SetStateAction<string>>;
  selectedProfile: string;
  setSelectedProfile: Dispatch<SetStateAction<string>>;

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

  avatars?: DropdownFieldOption[];
  voices?: DropdownFieldOption[];

  isDragActive: boolean;
  dragError: string | null;
  attachedPromptAssets: PromptBarAttachedAsset[];
  onDragEnter?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDropFiles?: (event: React.DragEvent<HTMLDivElement>) => Promise<void>;
  onRemoveAttachedAsset?: (assetId: string) => void;
  onBrowseAssets?: () => void;

  isCollapsed?: boolean;
  setIsCollapsed?: Dispatch<SetStateAction<boolean>>;
}

export const PromptBarInternalContext =
  createContext<PromptBarInternalContextValue | null>(null);

export function usePromptBarInternal(): PromptBarInternalContextValue {
  const context = useContext(PromptBarInternalContext);
  if (!context) {
    throw new Error(
      'usePromptBarInternal must be used within a PromptBarInternalContext.Provider',
    );
  }
  return context;
}
