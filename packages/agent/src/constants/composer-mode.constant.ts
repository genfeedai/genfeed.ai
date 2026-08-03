import { ModelCategory } from '@genfeedai/enums';

/**
 * Composer modality for the agent bar.
 * Orthogonal to the LLM picker: LLM plans; mode steers output/gen stack.
 */
export type ComposerMode = 'chat' | 'image' | 'video' | 'voice';

/** Synthetic key for “Auto” in image/video/voice model lists. */
export const COMPOSER_GENERATION_AUTO_MODEL_KEY = '__auto_model__';

export interface ComposerModeDefinition {
  readonly description: string;
  readonly label: string;
  readonly mode: ComposerMode;
  readonly placeholder: string;
  /** ModelCategory for gen-model list when mode is not chat. */
  readonly modelCategory: ModelCategory | null;
}

export const COMPOSER_MODES: readonly ComposerModeDefinition[] = [
  {
    description: 'Plan, research, and talk with the agent',
    label: 'Chat',
    mode: 'chat',
    modelCategory: null,
    placeholder: 'Ask for help with content, review, or planning…',
  },
  {
    description: 'Generate or edit images',
    label: 'Image',
    mode: 'image',
    modelCategory: ModelCategory.IMAGE,
    placeholder: 'Describe the image to generate…',
  },
  {
    description: 'Generate or edit video',
    label: 'Video',
    mode: 'video',
    modelCategory: ModelCategory.VIDEO,
    placeholder: 'Describe the video to generate…',
  },
  {
    description: 'Generate speech or voice',
    label: 'Voice',
    mode: 'voice',
    modelCategory: ModelCategory.VOICE,
    placeholder: 'Describe the voice clip or script…',
  },
] as const;

export const DEFAULT_COMPOSER_MODE: ComposerMode = 'chat';

export function getComposerModeDefinition(
  mode: ComposerMode,
): ComposerModeDefinition {
  return COMPOSER_MODES.find((item) => item.mode === mode) ?? COMPOSER_MODES[0];
}

export function isGenerationComposerMode(
  mode: ComposerMode,
): mode is Exclude<ComposerMode, 'chat'> {
  return mode !== 'chat';
}

/** Instruction injected into page context so the agent respects mode. */
export function buildComposerModeInstruction(
  mode: ComposerMode,
  generationModelKey: string | null,
): string | null {
  if (mode === 'chat') {
    return null;
  }

  const definition = getComposerModeDefinition(mode);
  const modelLine =
    generationModelKey && generationModelKey.length > 0
      ? `Preferred generation model key: ${generationModelKey}. Use it when calling generation tools.`
      : 'Use automatic generation model selection unless the user names a model.';

  return [
    `Composer mode for this turn: ${definition.label} (${mode}).`,
    `Prioritize ${mode} generation tools and outputs for this request.`,
    modelLine,
  ].join(' ');
}
