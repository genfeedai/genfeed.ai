import { RouterPriority } from '@genfeedai/contracts';
import type {
  StudioGenerateSettings,
  StudioGenerateType,
} from '@pages/studio/generate/types';
import {
  getDefaultStudioGenerateSettings,
  getStudioAspectRatios,
  getStudioDurations,
  getStudioResolutions,
  STUDIO_MAX_OUTPUTS,
} from '@pages/studio/generate/utils/studio-generate-settings';
import {
  resolveStudioGenerateType,
  STUDIO_GENERATE_TYPES,
} from '@pages/studio/generate/utils/studio-generate-types';

export const STUDIO_GENERATE_STORAGE_KEY = 'genfeed.studio.generate.v1';

export type StudioGenerateSettingsByType = Record<
  StudioGenerateType,
  StudioGenerateSettings
>;

export interface StudioGeneratePersistedState {
  settingsByType: StudioGenerateSettingsByType;
  type: StudioGenerateType;
}

export function getDefaultStudioGenerateState(): StudioGeneratePersistedState {
  return {
    settingsByType: STUDIO_GENERATE_TYPES.reduce((accumulator, type) => {
      accumulator[type] = getDefaultStudioGenerateSettings(type);
      return accumulator;
    }, {} as StudioGenerateSettingsByType),
    type: resolveStudioGenerateType(undefined),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pickString(
  value: unknown,
  allowed: readonly string[],
  fallback: string,
): string {
  return typeof value === 'string' && allowed.includes(value)
    ? value
    : fallback;
}

function pickNumber(
  value: unknown,
  allowed: readonly number[],
  fallback: number | undefined,
): number | undefined {
  return typeof value === 'number' && allowed.includes(value)
    ? value
    : fallback;
}

function pickFreeText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function pickOutputs(value: unknown, fallback: number): number {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= STUDIO_MAX_OUTPUTS
    ? value
    : fallback;
}

function isRouterPriority(value: unknown): value is RouterPriority {
  return (
    typeof value === 'string' &&
    (Object.values(RouterPriority) as string[]).includes(value)
  );
}

function pickStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string');
}

/**
 * Rehydrates one type's settings from untrusted localStorage JSON. Every
 * enumerated field is re-validated against the current option ladder so a
 * stale persisted value (an aspect ratio we no longer offer, an outputs count
 * beyond the cap) falls back to the default instead of reaching the API.
 */
export function sanitizeStudioGenerateSettings(
  type: StudioGenerateType,
  value: unknown,
): StudioGenerateSettings {
  const defaults = getDefaultStudioGenerateSettings(type);

  if (!isRecord(value)) {
    return defaults;
  }

  const durations = getStudioDurations(type);
  const {
    aspectRatio,
    avatarPhotoUrl,
    blacklist,
    brandingMode,
    camera,
    cameraMovement,
    duration,
    folder,
    isAudioEnabled,
    lens,
    lighting,
    modelKey,
    mood,
    outputs,
    prioritize,
    promptTemplate,
    resolution,
    scene,
    style,
    tags,
    voiceId,
  } = value;
  const resolvedModelKey =
    typeof modelKey === 'string' && modelKey.trim()
      ? modelKey
      : defaults.modelKey;
  const allowedResolutions = getStudioResolutions(type, resolvedModelKey).map(
    (option) => option.value,
  );

  return {
    ...defaults,
    aspectRatio: pickString(
      aspectRatio,
      getStudioAspectRatios(type),
      defaults.aspectRatio,
    ),
    avatarPhotoUrl: pickFreeText(avatarPhotoUrl),
    blacklist: pickStringList(blacklist),
    brandingMode: brandingMode === 'off' ? 'off' : 'brand',
    camera: pickFreeText(camera),
    cameraMovement: pickFreeText(cameraMovement),
    duration: pickNumber(duration, durations, defaults.duration),
    folder: pickFreeText(folder),
    isAudioEnabled: isAudioEnabled === true,
    lens: pickFreeText(lens),
    lighting: pickFreeText(lighting),
    modelKey: resolvedModelKey,
    mood: pickFreeText(mood),
    outputs: pickOutputs(outputs, defaults.outputs),
    prioritize: isRouterPriority(prioritize) ? prioritize : defaults.prioritize,
    promptTemplate: pickFreeText(promptTemplate),
    resolution: pickString(resolution, allowedResolutions, defaults.resolution),
    scene: pickFreeText(scene),
    // `speech` is per-submission copy, never restored from a previous session.
    speech: undefined,
    style: pickFreeText(style),
    tags: pickStringList(tags),
    voiceId: pickFreeText(voiceId),
  };
}

export function sanitizeStudioGenerateState(
  value: unknown,
): StudioGeneratePersistedState {
  const { settingsByType, type: persistedType } = isRecord(value)
    ? value
    : ({} as Record<string, unknown>);
  const persistedSettings = isRecord(settingsByType) ? settingsByType : {};

  return {
    settingsByType: STUDIO_GENERATE_TYPES.reduce((accumulator, type) => {
      accumulator[type] = sanitizeStudioGenerateSettings(
        type,
        persistedSettings[type],
      );
      return accumulator;
    }, {} as StudioGenerateSettingsByType),
    type: resolveStudioGenerateType(persistedType),
  };
}

export function readStudioGenerateState(): StudioGeneratePersistedState {
  if (typeof window === 'undefined') {
    return getDefaultStudioGenerateState();
  }

  try {
    const raw = window.localStorage.getItem(STUDIO_GENERATE_STORAGE_KEY);
    if (!raw) {
      return getDefaultStudioGenerateState();
    }
    return sanitizeStudioGenerateState(JSON.parse(raw));
  } catch {
    return getDefaultStudioGenerateState();
  }
}

export function writeStudioGenerateState(
  state: StudioGeneratePersistedState,
): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(
      STUDIO_GENERATE_STORAGE_KEY,
      JSON.stringify(state),
    );
  } catch {
    // Persistence is a convenience — a full or blocked store must not break
    // the composer.
  }
}
