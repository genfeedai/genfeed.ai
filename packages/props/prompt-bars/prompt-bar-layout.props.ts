import type { PromptTextareaSchema } from '@genfeedai/client/schemas';
import type {
  IngredientCategory,
  IngredientFormat,
  ModelCategory,
} from '@genfeedai/contracts';
import type { IAsset, IImage } from '@genfeedai/contracts/interfaces';
import type { StudioGenerationMeter } from '@props/prompt-bars/prompt-bar-generation-meter.props';
import type { AnyExtension, JSONContent } from '@tiptap/core';
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
  generationMeter?: StudioGenerationMeter | null;
  onSubmit: (event?: FormEvent) => void;
  onCancel?: () => void;
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
  extraExtensions?: readonly AnyExtension[];
  onDocumentChange?: (document: JSONContent) => void;
}

export interface PromptBarSpeechInputProps {
  shouldRender: boolean;
  isAvatarRoute: boolean;
  watchedSpeech: string | undefined;
  onSpeechChange: (value: string) => void;
  isDisabled: boolean;
  charLimit: number;
}
