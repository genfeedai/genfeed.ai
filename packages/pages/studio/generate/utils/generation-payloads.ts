import type { PromptTextareaSchema } from '@genfeedai/client/schemas';
import {
  ContentTemplateKey,
  IngredientCategory,
  IngredientFormat,
  RouterPriority,
} from '@genfeedai/contracts';
import { normalizeMusicSettings } from '@genfeedai/contracts/constants';
import type { IIngredient, IModel } from '@genfeedai/contracts/interfaces';
import type { CrunImageQuoteRequest } from '@genfeedai/contracts/interfaces/billing/crun-generation-quote.interface';
import type {
  AvatarGenerationPayload,
  BaseGenerationPayload,
  ImageGenerationPayload,
  MusicGenerationPayload,
  VideoGenerationPayload,
} from '@genfeedai/contracts/interfaces/content/generation-payload.interface';
import type { StudioGenerateSettings } from '@genfeedai/contracts/interfaces/studio/studio-generate.interface';
import { normalizeCrunInput } from '@genfeedai/helpers/crun-input-contract.helper';
import { isImageQualitySupported } from '@genfeedai/helpers/media/image-quality/image-quality.helper';
import type { BuildStudioCrunQuoteRequestProps } from '@genfeedai/props/studio/studio-generate.props';

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
    blacklist: promptData.blacklist || [],
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
    quality:
      basePayload.model &&
      isImageQualitySupported(basePayload.model, promptData.resolution)
        ? promptData.resolution
        : undefined,
  };
}

export function buildMusicPayload(
  promptData: PromptTextareaSchema & {
    instrumental?: boolean;
    isValid: boolean;
    lyrics?: string;
  },
  modelKey: string,
  duration?: number,
): MusicGenerationPayload {
  const effectiveText = promptData.text?.trim() || '';
  const isAutoSelectModel = promptData.autoSelectModel === true;
  const normalized = normalizeMusicSettings(
    isAutoSelectModel ? undefined : modelKey,
    { ...promptData, duration },
  );

  return {
    autoSelectModel: isAutoSelectModel,
    folder: promptData.folder || undefined,
    ...normalized,
    lyrics: normalized.lyrics?.trim() || undefined,
    label: `music-${Date.now()}`,
    model: isAutoSelectModel ? undefined : modelKey,
    outputs: promptData.outputs || 1,
    prioritize: promptData.prioritize ?? RouterPriority.BALANCED,
    style: promptData.style?.trim() || undefined,
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

/** Sends only the reviewed canonical input; legacy dimensions/seed/audio never leak. */
export function buildStudioCrunQuoteRequest({
  model,
  settings,
  promptText,
  references,
  brandId,
  promptId,
  requestedSkillSlugs,
  knowledge,
  harness = false,
}: BuildStudioCrunQuoteRequestProps): CrunImageQuoteRequest | null {
  const controls = model?.provider === 'crun' ? model.inputControls : undefined;
  if (!model || !controls || !settings.crunControls) return null;
  if (
    !controls ||
    settings.crunControls?.modelKey !== model?.key ||
    settings.crunControls.contractVersion !== controls.version ||
    !Number.isInteger(settings.outputs) ||
    settings.outputs < 1 ||
    settings.outputs > controls.maxOutputs ||
    new Set(references).size !== references.length ||
    (settings.crunControls.aspectRatio &&
      settings.crunControls.aspectRatio !== settings.aspectRatio)
  )
    return null;
  const clientControls = {
    ...controls,
    fields: Object.fromEntries(
      Object.entries(controls.fields).map(([key, field]) => [
        key,
        controls.referenceRoles[key] ? { ...field, format: undefined } : field,
      ]),
    ),
  };
  const values: Record<string, unknown> = {
    prompt: promptText.trim(),
    aspect_ratio: settings.aspectRatio,
    resolution: settings.resolution,
  };
  for (const field of Object.keys(controls.referenceRoles))
    values[field] = references;
  if (settings.crunControls.outputFormat)
    values.output_format = settings.crunControls.outputFormat;
  const normalized = normalizeCrunInput(clientControls, values);
  if (!normalized.isValid) return null;
  const resolution = normalized.input.resolution;
  const outputFormat = normalized.input.output_format;
  if (resolution !== '1K' && resolution !== '2K' && resolution !== '4K')
    return null;
  if (
    outputFormat !== undefined &&
    outputFormat !== 'png' &&
    outputFormat !== 'jpg'
  )
    return null;
  return {
    model: model.key,
    text: promptText.trim(),
    brandId,
    outputs: settings.outputs,
    references,
    crunControls: {
      contractVersion: controls.version,
      aspectRatio: settings.aspectRatio,
      resolution,
      ...(outputFormat ? { outputFormat } : {}),
    },
    brandingMode: settings.brandingMode,
    isBrandingEnabled: settings.brandingMode === 'brand',
    blacklist: settings.blacklist,
    useTemplate: true,
    harness,
    ...(settings.folder ? { folderId: settings.folder } : {}),
    ...(promptId ? { promptId } : {}),
    ...(settings.promptTemplate
      ? {
          promptTemplate:
            PRESET_TO_TEMPLATE_MAP[settings.promptTemplate] ??
            settings.promptTemplate,
        }
      : {}),
    ...Object.fromEntries(
      ['camera', 'style', 'scene', 'lighting', 'mood', 'lens'].flatMap(
        (field) => {
          const value = settings[field as keyof StudioGenerateSettings];
          return typeof value === 'string' && value.trim()
            ? [[field, value.trim()]]
            : [];
        },
      ),
    ),
    ...(requestedSkillSlugs?.length ? { requestedSkillSlugs } : {}),
    ...(knowledge ? { knowledge } : {}),
  };
}
