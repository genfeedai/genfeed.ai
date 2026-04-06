import type { PromptTextareaSchema } from '@genfeedai/client/schemas';
import { IngredientFormat } from '@genfeedai/enums';
import type { IIngredient, IMetadata, IPrompt } from '@genfeedai/interfaces';

export const PROMPT_STORAGE_KEY = 'studio_promptbar_state';

// Param categories for proper parsing
const STRING_PARAMS = [
  'text',
  'format',
  'style',
  'mood',
  'camera',
  'cameraMovement',
  'lens',
  'lighting',
  'scene',
  'fontFamily',
  'resolution',
  'category',
  'brand',
  'brandingMode',
  'endFrame',
  'speech',
  'avatarId',
  'voiceId',
  'sceneDescription',
  'prompt_template',
  'folder',
] as const;

const ARRAY_PARAMS = [
  'models',
  'references',
  'blacklist',
  'sounds',
  'tags',
] as const;

const BOOLEAN_PARAMS = ['isBrandingEnabled', 'isAudioEnabled'] as const;

const NUMBER_PARAMS = [
  'width',
  'height',
  'duration',
  'seed',
  'outputs',
] as const;

// All param keys for clearing from URL
export const ALL_PROMPT_CONFIG_PARAMS = [
  ...STRING_PARAMS,
  ...ARRAY_PARAMS,
  ...BOOLEAN_PARAMS,
  ...NUMBER_PARAMS,
] as const;

/**
 * Serialize PromptTextareaSchema config to URL query params.
 */
export function serializePromptConfigToParams(
  config: Partial<PromptTextareaSchema>,
): URLSearchParams {
  const params = new URLSearchParams();
  const normalizedConfig = { ...config };

  if (
    normalizedConfig.brandingMode === undefined &&
    normalizedConfig.isBrandingEnabled !== undefined
  ) {
    normalizedConfig.brandingMode = normalizedConfig.isBrandingEnabled
      ? 'brand'
      : 'off';
  }

  for (const [key, value] of Object.entries(normalizedConfig)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }

    if (key === 'isBrandingEnabled' && normalizedConfig.brandingMode) {
      continue;
    }

    if (
      (ARRAY_PARAMS as readonly string[]).includes(key) &&
      Array.isArray(value)
    ) {
      if (value.length > 0) {
        params.set(key, value.join(','));
      }
      continue;
    }

    if ((BOOLEAN_PARAMS as readonly string[]).includes(key)) {
      params.set(key, value ? '1' : '0');
      continue;
    }

    if (typeof value === 'number' || typeof value === 'string') {
      params.set(key, String(value));
    }
  }

  return params;
}

/**
 * Parse URL query params back to PromptTextareaSchema config.
 */
export function parsePromptConfigFromParams(
  params: URLSearchParams,
): Partial<PromptTextareaSchema> {
  const config: Partial<PromptTextareaSchema> = {};

  for (const key of STRING_PARAMS) {
    const value = params.get(key);
    if (value) {
      (config as Record<string, unknown>)[key] = decodeURIComponent(value);
    }
  }

  for (const key of NUMBER_PARAMS) {
    const value = params.get(key);
    if (value) {
      const parsed = parseInt(value, 10);
      if (!Number.isNaN(parsed)) {
        (config as Record<string, unknown>)[key] = parsed;
      }
    }
  }

  for (const key of BOOLEAN_PARAMS) {
    const value = params.get(key);
    if (value !== null) {
      (config as Record<string, unknown>)[key] =
        value === '1' || value === 'true';
    }
  }

  if (!config.brandingMode && config.isBrandingEnabled !== undefined) {
    config.brandingMode = config.isBrandingEnabled ? 'brand' : 'off';
  }

  for (const key of ARRAY_PARAMS) {
    const value = params.get(key);
    if (value) {
      (config as Record<string, unknown>)[key] = value
        .split(',')
        .filter(Boolean);
    }
  }

  return config;
}

/**
 * Persist prompt config/text to sessionStorage for Studio hydration.
 */
export function persistPromptConfigToSession(
  config: Partial<PromptTextareaSchema>,
  targetRoute: string,
): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const existing = sessionStorage.getItem(PROMPT_STORAGE_KEY);
    const parsedExisting = existing ? JSON.parse(existing) : {};

    sessionStorage.setItem(
      PROMPT_STORAGE_KEY,
      JSON.stringify({
        ...parsedExisting,
        lastCategory: targetRoute.includes('video') ? 'video' : 'image',
        promptConfig: {
          ...config,
          category: targetRoute.includes('video') ? 'video' : 'image',
        },
        promptText: config.text ?? '',
      }),
    );

    return true;
  } catch {
    return false;
  }
}

/**
 * Read prompt config/text from sessionStorage.
 */
export function readPromptConfigFromSession(): {
  promptText?: string;
  promptConfig?: Partial<PromptTextareaSchema>;
  lastCategory?: string;
} | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const stored = sessionStorage.getItem(PROMPT_STORAGE_KEY);
    if (!stored) {
      return null;
    }
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

/**
 * Clear prompt config/text from sessionStorage.
 */
export function clearPromptConfigFromSession(): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    sessionStorage.removeItem(PROMPT_STORAGE_KEY);
  } catch {
    // Storage unavailable - ignore
  }
}

/**
 * Build a complete URL for "Use Prompt" action from an ingredient.
 */
export function buildUsePromptUrl(
  ingredient: IIngredient,
  targetRoute: string,
): string {
  const metadata = ingredient.metadata as IMetadata | undefined;
  const prompt = ingredient.prompt as IPrompt | undefined;

  const config: Partial<PromptTextareaSchema> = {
    camera: ingredient.camera,
    format:
      ingredient.ingredientFormat ||
      ingredient.format ||
      IngredientFormat.PORTRAIT,
    height:
      metadata?.height ||
      ingredient.height ||
      ingredient.metadataHeight ||
      1920,
    mood: ingredient.mood,
    references: [ingredient.id],
    style: ingredient.style || metadata?.style || ingredient.metadataStyle,
    text: ingredient.promptText || prompt?.original || '',
    width:
      metadata?.width || ingredient.width || ingredient.metadataWidth || 1080,
  };

  const model = metadata?.model || ingredient.model || ingredient.metadataModel;
  if (model) {
    config.models = [model];
  }

  // Add duration for videos
  if (targetRoute.includes('video')) {
    const duration = metadata?.duration || ingredient.metadataDuration;
    if (duration) {
      config.duration = duration;
    }
  }

  if (!persistPromptConfigToSession(config, targetRoute)) {
    const params = serializePromptConfigToParams(config);
    const queryString = params.toString();
    if (!queryString) {
      return targetRoute;
    }
    const separator = targetRoute.includes('?') ? '&' : '?';
    return `${targetRoute}${separator}${queryString}`;
  }

  return targetRoute;
}

/**
 * Clear all prompt config params from URL.
 */
export function clearPromptConfigFromUrl(
  currentUrl: string,
  pathname: string,
): string {
  const url = new URL(currentUrl, 'http://localhost');
  const params = url.searchParams;

  for (const key of ALL_PROMPT_CONFIG_PARAMS) {
    params.delete(key);
  }
  params.delete('referenceImageId');

  const queryString = params.toString();
  return queryString ? `${pathname}?${queryString}` : pathname;
}
