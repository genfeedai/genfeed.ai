import {
  type PromptTextareaSchema,
  promptTextareaSchema,
} from '@genfeedai/client/schemas';
import { IngredientCategory, IngredientFormat } from '@genfeedai/enums';
import type {
  UsePromptBarFormOptions,
  UsePromptBarFormReturn,
} from '@genfeedai/props/studio/prompt-bar.props';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useForm, useWatch } from 'react-hook-form';

export function usePromptBarForm(
  options: UsePromptBarFormOptions = {},
): UsePromptBarFormReturn {
  const { promptData } = options;

  const form = useForm<PromptTextareaSchema>({
    defaultValues: {
      autoSelectModel: promptData?.autoSelectModel ?? false,
      avatarId: '',
      blacklist: [],
      brand: '',
      brandingMode: promptData?.brandingMode ?? 'off',
      camera: '',
      category: promptData?.category || IngredientCategory.VIDEO,
      duration: undefined,
      endFrame: '',
      folder: undefined,
      fontFamily: promptData?.fontFamily || 'montserrat-black',
      format: promptData?.format || IngredientFormat.PORTRAIT,
      height: promptData?.height || 1920,
      isAudioEnabled: true,
      models: promptData?.models || [],
      mood: '',
      outputs: 1,
      prioritize: promptData?.prioritize,
      quality: 'premium',
      references: [],
      resolution: '',
      scene: '',
      sceneDescription: '',
      seed: 0,
      sounds: [],
      speech: '',
      style: '',
      tags: [],
      text: promptData?.text,
      voiceId: '',
      width: promptData?.width || 1080,
    },
    resolver: standardSchemaResolver(promptTextareaSchema),
  });

  const currentFormat = useWatch({
    control: form.control,
    name: 'format',
  }) as IngredientFormat;

  return {
    currentFormat,
    form,
  };
}
