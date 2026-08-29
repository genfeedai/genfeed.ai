import type { PromptTextareaSchema } from '@genfeedai/client/schemas';
import {
  ContentTemplateKey,
  IngredientCategory,
  IngredientFormat,
  RouterPriority,
} from '@genfeedai/enums';
import type { IIngredient, IModel } from '@genfeedai/interfaces';
import type {
  AvatarGenerationPayload,
  BaseGenerationPayload,
  ImageGenerationPayload,
  MusicGenerationPayload,
  VideoGenerationPayload,
} from '@genfeedai/interfaces/content/generation-payload.interface';

/**
 * Also read by `useStudioGenerationSetupLookOptions` to build the Look tab's
 * "Prompt template" option list — the keys here are the only legal
 * `promptTemplate` values Studio ever posts.
 */
export const PRESET_TO_TEMPLATE_MAP: Record<string, ContentTemplateKey> = {
  'article-banner': ContentTemplateKey.IMAGE_BANNER,
  'cinematic-video': ContentTemplateKey.VIDEO_CINEMATIC,
  'influencer-photo': ContentTemplateKey.IMAGE_SUPER_MODEL,
  'influencer-video': ContentTemplateKey.VIDEO_INFLUENCER,
  'podcast-video': ContentTemplateKey.VIDEO_PODCAST,
  'product-ad-video': ContentTemplateKey.VIDEO_PRODUCT,
  'product-photo': ContentTemplateKey.IMAGE_PRODUCT,
  'social-media-video': ContentTemplateKey.VIDEO_SOCIAL,
  'super-model': ContentTemplateKey.IMAGE_SUPER_MODEL,
};

export function buildBaseGenerationPayload(
  promptData: PromptTextareaSchema & { isValid: boolean },
  modelKey: string,
  brandId: string,
): BaseGenerationPayload {
  const effectiveText = promptData.text?.trim() || '';
  const isAutoSelectModel = promptData.autoSelectModel === true;
  const brandingMode =
    promptData.brandingMode || (promptData.isBrandingEnabled ? 'brand' : 'off');

  return {
    autoSelectModel: isAutoSelectModel,
    blacklist: promptData.blacklist?.join(', '),
    brand: brandId,
    brandingMode,
    camera: promptData.camera?.trim() || undefined,
    folder: promptData.folder || undefined,
    height: promptData.height || 1920,
    isBrandingEnabled: brandingMode === 'brand',
    lighting: promptData.lighting?.trim() || undefined,
    model: isAutoSelectModel ? undefined : modelKey,
    mood: promptData.mood?.trim() || undefined,
    outputs: promptData.outputs || 1,
    prioritize: promptData.prioritize ?? RouterPriority.BALANCED,
    promptTemplate: promptData.prompt_template
      ? PRESET_TO_TEMPLATE_MAP[promptData.prompt_template] ||
        promptData.prompt_template
      : undefined,
    references: promptData.references || [],
    scene: promptData.scene?.trim() || undefined,
    style: promptData.style?.trim() || undefined,
    tags: promptData.tags || [],
    text: effectiveText,
    useTemplate: true,
    width: promptData.width || 1080,
  };
}

export function buildVideoPayload(
  basePayload: BaseGenerationPayload,
  promptData: PromptTextareaSchema & { isValid: boolean },
): VideoGenerationPayload {
  return {
    ...basePayload,
    cameraMovement: promptData.cameraMovement?.trim() || undefined,
    duration: promptData.duration || undefined,
    endFrame: promptData.endFrame?.trim() || undefined,
    fontFamily: promptData.fontFamily?.trim() || undefined,
    format:
      (promptData.format as IngredientFormat) || IngredientFormat.PORTRAIT,
    isAudioEnabled: promptData.isAudioEnabled ?? false,
    lens: promptData.lens?.trim() || undefined,
    resolution: promptData.resolution?.trim() || undefined,
    sounds: promptData.sounds || [],
    speech: promptData.speech?.trim() || undefined,
    videoReferences: promptData.videoReferences,
  };
}

export function buildImagePayload(
  basePayload: BaseGenerationPayload,
  promptData: PromptTextareaSchema & { isValid: boolean },
): ImageGenerationPayload {
  return {
    ...basePayload,
    format:
      (promptData.format as IngredientFormat) || IngredientFormat.PORTRAIT,
  };
}

export function buildMusicPayload(
  promptData: PromptTextareaSchema & { isValid: boolean },
  modelKey: string,
  duration: number = 10,
): MusicGenerationPayload {
  const effectiveText = promptData.text?.trim() || '';
  const isAutoSelectModel = promptData.autoSelectModel === true;

  return {
    autoSelectModel: isAutoSelectModel,
    duration,
    folder: promptData.folder || undefined,
    label: `music-${Date.now()}`,
    model: isAutoSelectModel ? undefined : modelKey,
    outputs: promptData.outputs || 1,
    prioritize: promptData.prioritize ?? RouterPriority.BALANCED,
    text: effectiveText,
  };
}

export function buildAvatarPayload(
  promptData: PromptTextareaSchema & { isValid: boolean },
  photoUrl?: string,
): AvatarGenerationPayload {
  const effectiveText = promptData.text?.trim() || '';

  return {
    ...(photoUrl ? { photoUrl } : { avatarId: promptData.avatarId }),
    speech: promptData.speech?.trim() || '',
    text: effectiveText,
    voiceId: promptData.voiceId,
  };
}

export function buildRepromptData(
  ingredient: IIngredient,
  categoryType: IngredientCategory,
  brandId: string,
  currentModels: IModel[],
): PromptTextareaSchema & { isValid: boolean } {
  const metadata: Record<string, unknown> =
    typeof ingredient.metadata === 'object' && ingredient.metadata !== null
      ? (ingredient.metadata as unknown as Record<string, unknown>)
      : {};

  const getMetadataValue = <T>(key: string, defaultValue: T): T => {
    const value = metadata[key];
    return typeof value === typeof defaultValue ? (value as T) : defaultValue;
  };

  /**
   * Optional string fields cannot go through `getMetadataValue` — a default of
   * `undefined` makes its `typeof` guard reject every stored string, silently
   * dropping the value on reprompt.
   */
  const getOptionalString = (key: string): string | undefined => {
    const value = metadata[key];
    return typeof value === 'string' && value ? value : undefined;
  };

  const isImageOrVideo =
    categoryType === IngredientCategory.IMAGE ||
    categoryType === IngredientCategory.VIDEO;

  const modelKey =
    ingredient.metadataModel ||
    getMetadataValue('model', '') ||
    currentModels[0]?.key ||
    '';

  return {
    blacklist: Array.isArray(metadata.blacklist)
      ? metadata.blacklist.filter(
          (item: unknown): item is string => typeof item === 'string',
        )
      : [],
    brand: brandId,
    camera: getOptionalString('camera'),
    cameraMovement: getOptionalString('cameraMovement'),
    category: String(categoryType),
    duration:
      typeof metadata.duration === 'number' ? metadata.duration : undefined,
    fontFamily: getMetadataValue('fontFamily', ''),
    format:
      ingredient.ingredientFormat ||
      (isImageOrVideo ? IngredientFormat.PORTRAIT : ''),
    height: ingredient.metadataHeight || ingredient.height || 1920,
    isAudioEnabled: Boolean(metadata.isAudioEnabled),
    isValid: true,
    lens: getOptionalString('lens'),
    lighting: getOptionalString('lighting'),
    models: [modelKey],
    mood: getOptionalString('mood'),
    outputs: 1,
    quality: 'premium',
    references: Array.isArray(ingredient.references)
      ? ingredient.references.filter(
          (ref): ref is string => typeof ref === 'string',
        )
      : [],
    resolution: getOptionalString('resolution'),
    scene: getOptionalString('scene'),
    sounds: Array.isArray(metadata.sounds)
      ? metadata.sounds.filter(
          (sound: unknown): sound is string => typeof sound === 'string',
        )
      : [],
    speech: getOptionalString('speech'),
    style: getMetadataValue('style', ''),
    tags: Array.isArray(ingredient.tags)
      ? ingredient.tags
          .map((tag) => tag.key || tag.label || tag.id)
          .filter((key): key is string => typeof key === 'string')
      : [],
    text: ingredient.promptText || '',
    width: ingredient.metadataWidth || ingredient.width || 1080,
  };
}
