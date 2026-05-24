import type { PromptTextareaSchema } from '@genfeedai/client/schemas';
import type {
  IngredientCategory,
  IngredientFormat,
  ModelCategory,
} from '@genfeedai/enums';
import type { IAsset, IImage } from '@genfeedai/interfaces';
import type { FormEvent, MutableRefObject, ReactNode, RefObject } from 'react';
import type { UseFormReturn } from 'react-hook-form';

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

export interface PromptBarSpeechInputProps {
  shouldRender: boolean;
  isAvatarRoute: boolean;
  watchedSpeech: string | undefined;
  onSpeechChange: (value: string) => void;
  isDisabled: boolean;
  charLimit: number;
}
