import type { PromptTextareaSchema } from '@genfeedai/client/schemas';
import {
  getModelDefaultDuration,
  getModelMaxOutputs,
} from '@genfeedai/constants';
import type { PromptBarInternalContextValue } from '@genfeedai/contexts/ui/prompt-bar-internal-context';
import type {
  IngredientCategory,
  IngredientFormat,
  ModelCategory,
  QualityTier,
  SubscriptionTier,
} from '@genfeedai/enums';
import { getDefaultVideoResolution } from '@genfeedai/helpers/media/video-resolution/video-resolution.helper';
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
  UploadModalOptions,
} from '@genfeedai/props/studio/prompt-bar.props';
import {
  type Dispatch,
  type FormEvent,
  type ReactNode,
  type RefObject,
  type SetStateAction,
  useMemo,
} from 'react';
import type {
  Path,
  UseFormRegisterReturn,
  UseFormReturn,
} from 'react-hook-form';

type UsePromptBarInternalContextValueParams = {
  currentConfig: MediaConfig;
  pathname: string;
  categoryType?: IngredientCategory;
  currentModelCategory: ModelCategory | null;
  isCollapsible: boolean;
  hasDragDrop: boolean;
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
  hasAudioToggle: boolean;
  hasSpeech: boolean;
  hasModelWithoutDurationEditing: boolean;
  hasAnyResolutionOptions: boolean;
  hasEndFrame: boolean;
  hasAnyImagenModel: boolean;
  isOnlyImagenModels: boolean;
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
  handleTextChange?: (text: string) => void;
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
  getMinFromAllModels: (getter: (modelKey: string) => number) => number;
  setTextValue: Dispatch<SetStateAction<string>>;
  isSupported: boolean;
  isVoiceControlEnabled: boolean | undefined;
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
  handlePromptBarDragEnter: (event: React.DragEvent<HTMLDivElement>) => void;
  handlePromptBarDragLeave: (event: React.DragEvent<HTMLDivElement>) => void;
  handleDroppedFiles: (event: React.DragEvent<HTMLDivElement>) => Promise<void>;
  handleRemoveAttachedAsset: (assetId: string) => void;
  openAttachedAssetsBrowser: () => void;
  isCollapsed: boolean;
  setIsCollapsed: Dispatch<SetStateAction<boolean>>;
};

export function usePromptBarInternalContextValue(
  p: UsePromptBarInternalContextValueParams,
): PromptBarInternalContextValue {
  return useMemo(
    () => ({
      currentConfig: p.currentConfig,
      pathname: p.pathname,
      categoryType: p.categoryType,
      currentModelCategory: p.currentModelCategory,
      features: { collapsible: p.isCollapsible, dragDrop: p.hasDragDrop },
      form: p.form,
      isDisabledState: p.isDisabledState,
      isGenerateBlocked: p.isGenerateBlocked,
      controlClass: p.controlClass,
      iconButtonClass: p.iconButtonClass,
      isAdvancedMode: p.isAdvancedMode,
      isAdvancedControlsEnabled: p.isAdvancedControlsEnabled,
      isAutoMode: p.isAutoMode,
      setIsAutoMode: p.setIsAutoMode,
      models: p.models,
      trainings: p.trainings,
      selectedModels: p.selectedModels,
      trainingIds: p.trainingIds,
      normalizedWatchedModels: p.normalizedWatchedModels,
      watchedModels: p.watchedModels,
      watchedModel: p.watchedModel,
      watchedFormat: p.watchedFormat,
      watchedWidth: p.watchedWidth,
      watchedHeight: p.watchedHeight,
      watchedDuration: p.watchedDuration,
      watchedSpeech: p.watchedSpeech,
      watchedQuality: p.watchedQuality,
      subscriptionTier: p.subscriptionTier,
      isModelNotSet: p.isModelNotSet,
      hasAudioToggleValue: p.hasAudioToggle,
      hasSpeechValue: p.hasSpeech,
      hasModelWithoutDurationEditingValue: p.hasModelWithoutDurationEditing,
      hasAnyResolutionOptionsValue: p.hasAnyResolutionOptions,
      hasEndFrameValue: p.hasEndFrame,
      hasAnyImagenModelValue: p.hasAnyImagenModel,
      isOnlyImagenModelsValue: p.isOnlyImagenModels,
      supportsInterpolation: p.supportsInterpolation,
      supportsMultipleReferences: p.supportsMultipleReferences,
      requiresReferences: p.requiresReferences,
      maxReferenceCount: p.maxReferenceCount,
      formatIcon: p.formatIcon,
      videoDurations: p.videoDurations,
      references: p.references,
      setReferences: p.setReferences,
      endFrame: p.endFrame,
      setEndFrame: p.setEndFrame,
      referenceSource: p.referenceSource,
      setReferenceSource: p.setReferenceSource,
      folders: p.folders,
      profiles: p.profiles,
      filteredPresets: p.filteredPresets,
      filteredScenes: p.filteredScenes,
      filteredFontFamilies: p.filteredFontFamilies,
      filteredStyles: p.filteredStyles,
      filteredCameras: p.filteredCameras,
      filteredLightings: p.filteredLightings,
      filteredLenses: p.filteredLenses,
      filteredCameraMovements: p.filteredCameraMovements,
      filteredMoods: p.filteredMoods,
      selectedPreset: p.selectedPreset,
      setSelectedPreset: p.setSelectedPreset,
      selectedProfile: p.selectedProfile,
      setSelectedProfile: p.setSelectedProfile,
      triggerConfigChange: p.triggerConfigChange,
      refocusTextarea: p.refocusTextarea,
      handleTextareaChange: p.handleTextareaChange,
      onTextChange: p.handleTextChange,
      handleCopy: p.handleCopy,
      enhancePrompt: p.enhancePrompt,
      handleUndo: p.handleUndo,
      handleSubmitForm: p.handleSubmitForm,
      suggestions: p.suggestions,
      onSuggestionSelect: p.onSuggestionSelect,
      showSuggestionsWhenEmpty: p.showSuggestionsWhenEmpty,
      maxSuggestions: p.maxSuggestions,
      openGallery: p.openGallery,
      openUpload: p.openUpload,
      textareaRef: p.textareaRef,
      textareaRegister: p.textareaRegister,
      modelDropdownRef: p.modelDropdownRef,
      promptBarHeight: p.promptBarHeight,
      getModelDefaultDuration,
      getDefaultVideoResolution,
      getMinFromAllModels: p.getMinFromAllModels,
      getModelMaxOutputs,
      setTextValue: p.setTextValue,
      isSupported: p.isSupported && p.isVoiceControlEnabled !== false,
      toggleVoice: p.toggleVoice,
      isRecording: p.isRecording,
      isProcessing: p.isProcessing,
      isGenerating: p.isGenerating,
      isEnhancing: p.isEnhancing,
      isGenerateDisabled: p.isGenerateDisabled,
      previousPrompt: p.previousPrompt,
      selectedModelCost: p.selectedModelCost,
      activeGenerations: p.activeGenerations,
      generateLabel: p.generateLabel,
      avatars: p.avatars,
      voices: p.voices,
      isDragActive: p.isDragActive,
      dragError: p.dragError,
      attachedPromptAssets: p.attachedPromptAssets,
      onDragEnter: p.handlePromptBarDragEnter,
      onDragLeave: p.handlePromptBarDragLeave,
      onDropFiles: p.handleDroppedFiles,
      onRemoveAttachedAsset: p.handleRemoveAttachedAsset,
      onBrowseAssets: p.openAttachedAssetsBrowser,
      isCollapsed: p.isCollapsed,
      setIsCollapsed: p.setIsCollapsed,
    }),
    [
      p.currentConfig,
      p.pathname,
      p.categoryType,
      p.currentModelCategory,
      p.isCollapsible,
      p.hasDragDrop,
      p.form,
      p.isDisabledState,
      p.isGenerateBlocked,
      p.controlClass,
      p.iconButtonClass,
      p.isAdvancedMode,
      p.isAdvancedControlsEnabled,
      p.isAutoMode,
      p.setIsAutoMode,
      p.models,
      p.trainings,
      p.selectedModels,
      p.trainingIds,
      p.normalizedWatchedModels,
      p.watchedModels,
      p.watchedModel,
      p.watchedFormat,
      p.watchedWidth,
      p.watchedHeight,
      p.watchedDuration,
      p.watchedSpeech,
      p.watchedQuality,
      p.subscriptionTier,
      p.isModelNotSet,
      p.hasAudioToggle,
      p.hasSpeech,
      p.hasModelWithoutDurationEditing,
      p.hasAnyResolutionOptions,
      p.hasEndFrame,
      p.hasAnyImagenModel,
      p.isOnlyImagenModels,
      p.supportsInterpolation,
      p.supportsMultipleReferences,
      p.requiresReferences,
      p.maxReferenceCount,
      p.formatIcon,
      p.videoDurations,
      p.references,
      p.setReferences,
      p.endFrame,
      p.setEndFrame,
      p.referenceSource,
      p.setReferenceSource,
      p.folders,
      p.profiles,
      p.filteredPresets,
      p.filteredScenes,
      p.filteredFontFamilies,
      p.filteredStyles,
      p.filteredCameras,
      p.filteredLightings,
      p.filteredLenses,
      p.filteredCameraMovements,
      p.filteredMoods,
      p.selectedPreset,
      p.setSelectedPreset,
      p.selectedProfile,
      p.setSelectedProfile,
      p.triggerConfigChange,
      p.refocusTextarea,
      p.handleTextareaChange,
      p.handleTextChange,
      p.handleCopy,
      p.enhancePrompt,
      p.handleUndo,
      p.handleSubmitForm,
      p.suggestions,
      p.onSuggestionSelect,
      p.showSuggestionsWhenEmpty,
      p.maxSuggestions,
      p.openGallery,
      p.openUpload,
      p.textareaRef,
      p.textareaRegister,
      p.modelDropdownRef,
      p.promptBarHeight,
      p.getMinFromAllModels,
      p.setTextValue,
      p.isSupported,
      p.isVoiceControlEnabled,
      p.toggleVoice,
      p.isRecording,
      p.isProcessing,
      p.isGenerating,
      p.isEnhancing,
      p.isGenerateDisabled,
      p.previousPrompt,
      p.selectedModelCost,
      p.activeGenerations,
      p.generateLabel,
      p.avatars,
      p.voices,
      p.isDragActive,
      p.dragError,
      p.attachedPromptAssets,
      p.handlePromptBarDragEnter,
      p.handlePromptBarDragLeave,
      p.handleDroppedFiles,
      p.handleRemoveAttachedAsset,
      p.openAttachedAssetsBrowser,
      p.isCollapsed,
      p.setIsCollapsed,
    ],
  );
}
