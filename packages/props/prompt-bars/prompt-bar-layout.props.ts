import type { PromptTextareaSchema } from '@genfeedai/client/schemas';
import type {
  IngredientCategory,
  IngredientFormat,
  ModelCategory,
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
  IFontFamily,
  IImage,
  IModel,
  IPreset,
  ISound,
} from '@genfeedai/interfaces';
import type { MediaConfig } from '@genfeedai/interfaces/ui/media-config.interface';
import type { Image as ImageModel } from '@genfeedai/models/ingredients/image.model';
import type {
  PromptBarFormatControlsProps,
  PromptBarModelControlsProps,
  PromptBarQualityControlsProps,
} from '@props/studio/prompt-bar.props';
import type {
  ChangeEvent,
  Dispatch,
  FormEvent,
  MutableRefObject,
  ReactNode,
  RefObject,
  SetStateAction,
} from 'react';
import type { UseFormRegisterReturn, UseFormReturn } from 'react-hook-form';

export interface PromptBarGalleryConfig {
  category: IngredientCategory;
  title?: string;
  selectedId?: string;
  format?: string;
  isNoneAllowed?: boolean;
  maxSelectableItems?: number;
  accountReference?: { id: string; url: string } | null;
  selectedReferences?: string[];
  onSelect: (
    selection:
      | ImageModel
      | ImageModel[]
      | IAsset
      | IAsset[]
      | IImage
      | IImage[]
      | null,
  ) => void;
  onSelectAccountReference?: (assets: IAsset[]) => void;
}

export interface PromptBarCollapsedViewProps {
  collapsedInputRef: RefObject<HTMLInputElement | null>;
  form: UseFormReturn<PromptTextareaSchema>;
  placeholder: string;
  isDisabled: boolean;
  isGenerateBlocked: boolean;
  isGenerateDisabled: boolean;
  isGenerating: boolean;
  selectedModelCost?: number;
  onSubmit: (event?: FormEvent) => void;
  generateLabel: string;
  activeGenerationsCount: number;
  onExpand: () => void;
  isFormValid: boolean;
  isInternalUpdateRef: MutableRefObject<boolean>;
  onTextChange?: () => void;
  watchedModel?: string;
  formatIcon?: ReactNode;
  references?: (IAsset | IImage)[];
  referenceSource?: 'brand' | 'ingredient' | '';
  outputs?: number;
  onOutputsChange?: (count: number) => void;
  categoryType?: IngredientCategory;
  currentModelCategory?: ModelCategory | null;
  onCreateVariation?: (reference: IAsset | IImage) => void;
  onFormatChange?: (format: IngredientFormat) => void;
  onClearReferences?: () => void;
  watchedFormat?: IngredientFormat;
  isSupported?: boolean;
  toggleVoice?: () => void;
  isRecording?: boolean;
  isProcessing?: boolean;
}

export interface PromptBarPrimaryControlsRowProps {
  isAdvancedControlsEnabled: boolean;
  modelControlsProps: PromptBarModelControlsProps;
  qualityControlsProps: PromptBarQualityControlsProps;
  formatControlsProps: PromptBarFormatControlsProps;
  videoDurations: number[];
  categoryType?: IngredientCategory;
  form: UseFormReturn<PromptTextareaSchema>;
  controlClass: string;
  isDisabledState: boolean;
  hasModelWithoutDurationEditing: boolean;
  hasAnyResolutionOptions: boolean;
  normalizedWatchedModels: string[];
  triggerConfigChange: () => void;
  hasAudioToggle: boolean;
  onToggleCollapse: () => void;
}

export interface PromptBarSecondaryControlsRowProps {
  currentConfig: MediaConfig;
  filteredPresets: IPreset[];
  profiles: Array<{ id: string; name: string; description?: string }>;
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
  form: UseFormReturn<PromptTextareaSchema>;
  selectedPreset: string;
  setSelectedPreset: Dispatch<SetStateAction<string>>;
  selectedProfile: string;
  setSelectedProfile: Dispatch<SetStateAction<string>>;
  refocusTextarea: () => void;
  isDisabledState: boolean;
  controlClass: string;
}

export interface PromptBarSpeechInputProps {
  shouldRender: boolean;
  isAvatarRoute: boolean;
  watchedSpeech: string | undefined;
  onSpeechChange: (value: string) => void;
  isDisabled: boolean;
  charLimit: number;
}

export interface PromptBarTextareaSectionProps {
  textareaRegister: UseFormRegisterReturn<'text'>;
  textareaRef: RefObject<HTMLTextAreaElement>;
  placeholder: string;
  isDisabled: boolean;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  selectedModels: IModel[];
}

export interface AiActionsConfig {
  orgId: string;
  token: string;
  onAiResult?: (action: string, result: string) => void;
}

export interface PromptBarActionsRowProps {
  aiActionsConfig?: AiActionsConfig;
  iconButtonClass: string;
  isAutoMode: boolean;
  setIsAutoMode: Dispatch<SetStateAction<boolean>>;
  models: IModel[];
  currentConfig: MediaConfig;
  form: UseFormReturn<PromptTextareaSchema>;
  openGallery: (config: PromptBarGalleryConfig) => void;
  handleReferenceSelect: (
    selection:
      | ImageModel
      | ImageModel[]
      | IAsset
      | IAsset[]
      | IImage
      | IImage[]
      | null,
  ) => void;
  handleSelectAccountReference: (assets: { id: string; url: string }[]) => void;
  references: (IAsset | IImage)[];
  referenceSource: '' | 'brand' | 'ingredient';
  setReferenceSource: Dispatch<SetStateAction<'' | 'brand' | 'ingredient'>>;
  setReferences: Dispatch<SetStateAction<(IAsset | IImage)[]>>;
  supportsMultipleReferences: boolean;
  maxReferenceCount: number;
  isDisabledState: boolean;
  hasEndFrame: boolean;
  endFrame: IAsset | IImage | null;
  setEndFrame: Dispatch<SetStateAction<IAsset | IImage | null>>;
  hasAnyImagenModel: boolean;
  isOnlyImagenModels: boolean;
  watchedFormat: IngredientFormat;
  isSupported: boolean;
  toggleVoice: () => void;
  isRecording: boolean;
  isProcessing: boolean;
  handleCopy: (text?: string) => Promise<void>;
  enhancePrompt: () => Promise<void>;
  isGenerating: boolean;
  isEnhancing: boolean;
  normalizedWatchedModels: string[];
  getMinFromAllModels: (getter: (modelKey: string) => number) => number;
  getModelMaxOutputs: (modelKey: string) => number;
  refocusTextarea: () => void;
  controlClass: string;
  isGenerateDisabled: boolean;
  selectedModelCost: number;
  handleSubmitForm: (event?: FormEvent) => void;
  activeGenerationsCount: number;
  generateLabel: string;
  isFormValid: boolean;
  triggerConfigChange: () => void;
}
