import type { PromptTextareaSchema } from '@genfeedai/client/schemas';
import { IngredientFormat, RouterPriority } from '@genfeedai/enums';
import { AUTO_MODEL_OPTION_VALUE } from '@ui/dropdowns/model-selector/model-selector.constants';
import type { StudioGenerateSettings, StudioGenerateType } from '../types';
import { getStudioGenerateTypeConfig } from './studio-generate-types';

/** Aspect ladder shown in the settings popover, widest to tallest. */
export const STUDIO_ASPECT_RATIOS = [
  '21:9',
  '16:9',
  '3:2',
  '4:3',
  '5:4',
  '1:1',
  '4:5',
  '3:4',
  '2:3',
  '9:16',
] as const;

export const STUDIO_IMAGE_RESOLUTIONS = ['1K', '2K'] as const;
export const STUDIO_VIDEO_RESOLUTIONS = ['480p', '720p', '1080p'] as const;

export const STUDIO_VIDEO_DURATIONS = [5, 8, 10] as const;
export const STUDIO_MUSIC_DURATIONS = [10, 15, 30] as const;

export const STUDIO_MAX_OUTPUTS = 8;

/** Long edge in pixels for each resolution label. */
const RESOLUTION_LONG_EDGE: Record<string, number> = {
  '1080p': 1920,
  '1K': 1024,
  '2K': 2048,
  '480p': 854,
  '720p': 1280,
};

const DEFAULT_LONG_EDGE = 1024;
const EDGE_MULTIPLE = 8;

function snapToMultiple(value: number): number {
  return Math.max(
    EDGE_MULTIPLE,
    Math.round(value / EDGE_MULTIPLE) * EDGE_MULTIPLE,
  );
}

function parseAspectRatio(
  aspectRatio: string,
): { horizontal: number; vertical: number } | null {
  const [rawHorizontal, rawVertical] = aspectRatio.split(':');
  const horizontal = Number(rawHorizontal);
  const vertical = Number(rawVertical);

  if (
    !Number.isFinite(horizontal) ||
    !Number.isFinite(vertical) ||
    horizontal <= 0 ||
    vertical <= 0
  ) {
    return null;
  }

  return { horizontal, vertical };
}

/**
 * Pins the long edge to `longEdge` and derives the short edge from the ratio,
 * snapped to a multiple of 8 so diffusion models never get a ragged size.
 */
export function resolveAspectDimensions(
  aspectRatio: string,
  longEdge: number = DEFAULT_LONG_EDGE,
): { height: number; width: number } {
  const parsed = parseAspectRatio(aspectRatio);

  if (!parsed) {
    return { height: longEdge, width: longEdge };
  }

  const { horizontal, vertical } = parsed;

  if (horizontal >= vertical) {
    return {
      height: snapToMultiple((longEdge * vertical) / horizontal),
      width: longEdge,
    };
  }

  return {
    height: longEdge,
    width: snapToMultiple((longEdge * horizontal) / vertical),
  };
}

export function resolveIngredientFormat(aspectRatio: string): IngredientFormat {
  const parsed = parseAspectRatio(aspectRatio);

  if (!parsed || parsed.horizontal === parsed.vertical) {
    return IngredientFormat.SQUARE;
  }

  return parsed.horizontal > parsed.vertical
    ? IngredientFormat.LANDSCAPE
    : IngredientFormat.PORTRAIT;
}

export function resolveLongEdge(resolution: string): number {
  return RESOLUTION_LONG_EDGE[resolution] ?? DEFAULT_LONG_EDGE;
}

export function getStudioAspectRatios(
  type: StudioGenerateType,
): readonly string[] {
  return getStudioGenerateTypeConfig(type).capabilities.hasAspectRatio
    ? STUDIO_ASPECT_RATIOS
    : [];
}

export function getStudioResolutions(
  type: StudioGenerateType,
): readonly string[] {
  if (type === 'video') {
    return STUDIO_VIDEO_RESOLUTIONS;
  }

  return getStudioGenerateTypeConfig(type).capabilities.hasAspectRatio
    ? STUDIO_IMAGE_RESOLUTIONS
    : [];
}

export function getStudioDurations(
  type: StudioGenerateType,
): readonly number[] {
  if (type === 'video') {
    return STUDIO_VIDEO_DURATIONS;
  }

  if (type === 'music') {
    return STUDIO_MUSIC_DURATIONS;
  }

  return [];
}

const DEFAULT_ASPECT_RATIO_BY_TYPE: Partial<
  Record<StudioGenerateType, string>
> = {
  image: '1:1',
  video: '16:9',
};

const DEFAULT_RESOLUTION_BY_TYPE: Partial<Record<StudioGenerateType, string>> =
  {
    image: '1K',
    video: '720p',
  };

const DEFAULT_DURATION_BY_TYPE: Partial<Record<StudioGenerateType, number>> = {
  music: STUDIO_MUSIC_DURATIONS[0],
  video: STUDIO_VIDEO_DURATIONS[0],
};

/**
 * Brand enrichment is on by default — the whole point of generating inside
 * Studio rather than hitting a raw provider playground.
 */
export function getDefaultStudioGenerateSettings(
  type: StudioGenerateType,
): StudioGenerateSettings {
  return {
    aspectRatio: DEFAULT_ASPECT_RATIO_BY_TYPE[type] ?? '1:1',
    blacklist: [],
    brandingMode: 'brand',
    duration: DEFAULT_DURATION_BY_TYPE[type],
    isAudioEnabled: false,
    modelKey: AUTO_MODEL_OPTION_VALUE,
    outputs: 1,
    prioritize: RouterPriority.BALANCED,
    resolution: DEFAULT_RESOLUTION_BY_TYPE[type] ?? '1K',
    tags: [],
  };
}

function optionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Turns composer + settings state into the full `PromptTextareaSchema` the
 * generation payload builders consume. This is where Studio regains the
 * Genfeed enrichment the agent card path never sends: branding mode, preset
 * template, folder targeting, and every Look element.
 */
export function buildStudioPromptData({
  brandId,
  promptText,
  references = [],
  settings,
  type,
}: {
  brandId: string;
  promptText: string;
  references?: string[];
  settings: StudioGenerateSettings;
  type: StudioGenerateType;
}): PromptTextareaSchema & { isValid: boolean } {
  const config = getStudioGenerateTypeConfig(type);
  const { capabilities } = config;

  const text = promptText.trim();
  const speech = optionalText(settings.speech);
  const isAutoSelectModel =
    !capabilities.hasModelSelection ||
    settings.modelKey === AUTO_MODEL_OPTION_VALUE ||
    settings.modelKey === '';

  const { height, width } = resolveAspectDimensions(
    settings.aspectRatio,
    resolveLongEdge(settings.resolution),
  );

  // Avatar and voice are driven by the spoken script, so speech alone is a
  // valid submission there.
  const isValid = capabilities.hasSpeech
    ? Boolean(text || speech)
    : Boolean(text);

  return {
    autoSelectModel: isAutoSelectModel,
    avatarId: capabilities.hasIdentity ? settings.avatarId : undefined,
    blacklist: settings.blacklist,
    brand: brandId,
    brandingMode: settings.brandingMode,
    camera: capabilities.hasLook ? optionalText(settings.camera) : undefined,
    cameraMovement: capabilities.hasLook
      ? optionalText(settings.cameraMovement)
      : undefined,
    category: config.ingredientCategory,
    duration: capabilities.hasDuration ? settings.duration : undefined,
    folder: optionalText(settings.folder),
    fontFamily: '',
    format: resolveIngredientFormat(settings.aspectRatio),
    height,
    isAudioEnabled: settings.isAudioEnabled,
    isBrandingEnabled: settings.brandingMode === 'brand',
    isValid,
    lens: capabilities.hasLook ? optionalText(settings.lens) : undefined,
    lighting: capabilities.hasLook
      ? optionalText(settings.lighting)
      : undefined,
    models:
      isAutoSelectModel || !capabilities.hasModelSelection
        ? []
        : [settings.modelKey],
    mood: capabilities.hasLook ? optionalText(settings.mood) : undefined,
    outputs: capabilities.hasOutputs ? settings.outputs : 1,
    prioritize: settings.prioritize,
    prompt_template: capabilities.hasLook
      ? optionalText(settings.promptTemplate)
      : undefined,
    quality: 'standard',
    references: capabilities.hasReferences ? references : [],
    resolution: settings.resolution,
    scene: capabilities.hasLook ? optionalText(settings.scene) : undefined,
    sounds: [],
    speech: capabilities.hasSpeech ? speech : undefined,
    style: (capabilities.hasLook && optionalText(settings.style)) || '',
    tags: settings.tags,
    text,
    voiceId: capabilities.hasIdentity ? settings.voiceId : undefined,
    width,
  };
}

/**
 * Compact label for the composer's gear chip, e.g. `16:9 · 720p · 5s`. Only
 * capabilities the type actually exposes contribute a segment, so Voice reads
 * as `Brand` rather than as a fake `1:1 · 1K`.
 */
export function describeStudioGenerateSettings(
  settings: StudioGenerateSettings,
  type: StudioGenerateType,
): string {
  const { capabilities } = getStudioGenerateTypeConfig(type);
  const segments: string[] = [];

  if (capabilities.hasAspectRatio) {
    segments.push(settings.aspectRatio);
  }

  if (getStudioResolutions(type).length > 0) {
    segments.push(settings.resolution);
  }

  if (capabilities.hasDuration && settings.duration) {
    segments.push(`${settings.duration}s`);
  }

  if (capabilities.hasOutputs && settings.outputs > 1) {
    segments.push(`${settings.outputs}x`);
  }

  if (settings.brandingMode === 'brand') {
    segments.push('Brand');
  }

  return segments.join(' · ');
}
