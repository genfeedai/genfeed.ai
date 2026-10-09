import { RouterPriority } from '@genfeedai/contracts';
import {
  isImageEditSize,
  normalizeMusicSettings,
} from '@genfeedai/contracts/constants';
import type {
  HeyGenAvatarRef,
  IBrandAgentConfig,
} from '@genfeedai/contracts/interfaces';
import { isRecord } from '@genfeedai/utils/data/extract.util';
import type {
  StudioPlaygroundSettings,
  StudioPlaygroundType,
} from '@pages/studio/playground/types';
import {
  getDefaultStudioPlaygroundSettings,
  getStudioAspectRatios,
  getStudioDurations,
  getStudioResolutions,
  STUDIO_MAX_OUTPUTS,
} from '@pages/studio/playground/utils/studio-playground-settings';
import {
  resolveStudioPlaygroundType,
  STUDIO_PLAYGROUND_TYPES,
} from '@pages/studio/playground/utils/studio-playground-types';

export const STUDIO_PLAYGROUND_STORAGE_KEY = 'genfeed.studio.generate.v1';

export type StudioPlaygroundSettingsByType = Record<
  StudioPlaygroundType,
  StudioPlaygroundSettings
>;

export interface StudioPlaygroundPersistedState {
  settingsByType: StudioPlaygroundSettingsByType;
  type: StudioPlaygroundType;
}

export function getDefaultStudioPlaygroundState(): StudioPlaygroundPersistedState {
  return {
    settingsByType: STUDIO_PLAYGROUND_TYPES.reduce((accumulator, type) => {
      accumulator[type] = getDefaultStudioPlaygroundSettings(type);
      return accumulator;
    }, {} as StudioPlaygroundSettingsByType),
    type: resolveStudioPlaygroundType(undefined),
  };
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
export function sanitizeStudioPlaygroundSettings(
  type: StudioPlaygroundType,
  value: unknown,
): StudioPlaygroundSettings {
  const defaults = getDefaultStudioPlaygroundSettings(type);

  if (!isRecord(value)) {
    return defaults;
  }

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
  const isCrunVideo = type === 'video' && resolvedModelKey.startsWith('crun/');
  const durations = getStudioDurations(type, resolvedModelKey);
  const allowedResolutions = getStudioResolutions(type, resolvedModelKey).map(
    (option) => option.value,
  );

  return {
    ...defaults,
    crunControls:
      (type === 'image' || type === 'video') &&
      isRecord(value.crunControls) &&
      value.crunControls.modelKey === resolvedModelKey &&
      typeof value.crunControls.contractVersion === 'string' &&
      value.crunControls.contractVersion.length > 0 &&
      value.crunControls.contractVersion.length <= 256
        ? {
            modelKey: resolvedModelKey,
            contractVersion: value.crunControls.contractVersion,
            ...(typeof value.crunControls.aspectRatio === 'string' &&
            /^(auto|\d{1,2}:\d{1,2})$/.test(value.crunControls.aspectRatio)
              ? { aspectRatio: value.crunControls.aspectRatio }
              : {}),
            ...(type === 'video' &&
            typeof value.crunControls.guidanceScale === 'number' &&
            Number.isFinite(value.crunControls.guidanceScale) &&
            value.crunControls.guidanceScale >= 0 &&
            value.crunControls.guidanceScale <= 1
              ? { guidanceScale: value.crunControls.guidanceScale }
              : {}),
            ...(type === 'video' &&
            typeof value.crunControls.translatePrompt === 'boolean'
              ? { translatePrompt: value.crunControls.translatePrompt }
              : {}),
            ...(typeof value.crunControls.outputFormat === 'string' &&
            ['png', 'jpg'].includes(value.crunControls.outputFormat)
              ? { outputFormat: value.crunControls.outputFormat }
              : {}),
          }
        : undefined,
    editPrimaryId: pickFreeText(value.editPrimaryId),
    editSize: isImageEditSize(value.editSize) ? value.editSize : 'source',
    editSeed:
      typeof value.editSeed === 'number' &&
      Number.isInteger(value.editSeed) &&
      value.editSeed >= 0 &&
      value.editSeed <= 2147483647
        ? value.editSeed
        : undefined,
    aspectRatio: pickString(
      aspectRatio,
      getStudioAspectRatios(type, resolvedModelKey),
      defaults.aspectRatio,
    ),
    avatarPhotoUrl: pickFreeText(avatarPhotoUrl),
    avatarRef:
      isRecord(value.avatarRef) &&
      value.avatarRef.source === 'heygen-look' &&
      typeof value.avatarRef.lookId === 'string' &&
      isRecord(value.avatarRef.connection)
        ? (value.avatarRef as unknown as HeyGenAvatarRef)
        : undefined,
    voiceRef:
      isRecord(value.voiceRef) &&
      ['catalog', 'cloned'].includes(String(value.voiceRef.source)) &&
      typeof value.voiceRef.provider === 'string'
        ? (value.voiceRef as NonNullable<IBrandAgentConfig['defaultVoiceRef']>)
        : undefined,
    blacklist: pickStringList(blacklist),
    brandingMode: brandingMode === 'off' ? 'off' : 'brand',
    camera: pickFreeText(camera),
    cameraMovement: pickFreeText(cameraMovement),
    duration: isCrunVideo
      ? typeof duration === 'number' && Number.isFinite(duration)
        ? duration
        : undefined
      : pickNumber(duration, durations, defaults.duration),
    folder: pickFreeText(folder),
    isAudioEnabled: isAudioEnabled === true,
    lens: pickFreeText(lens),
    lighting: pickFreeText(lighting),
    modelKey: resolvedModelKey,
    mood: pickFreeText(mood),
    outputs: pickOutputs(outputs, defaults.outputs),
    prioritize: isRouterPriority(prioritize) ? prioritize : defaults.prioritize,
    promptTemplate: pickFreeText(promptTemplate),
    resolution: isCrunVideo
      ? (pickFreeText(resolution) ?? '')
      : pickString(resolution, allowedResolutions, defaults.resolution),
    scene: pickFreeText(scene),
    // `speech` is per-submission copy, never restored from a previous session.
    speech: undefined,
    style: pickFreeText(style),
    tags: pickStringList(tags),
    voiceId: pickFreeText(voiceId),
    ...(type === 'music'
      ? normalizeMusicSettings(resolvedModelKey, {
          duration: typeof duration === 'number' ? duration : undefined,
          instrumental:
            typeof value.instrumental === 'boolean'
              ? value.instrumental
              : undefined,
          lyrics: pickFreeText(value.lyrics),
        })
      : {}),
  };
}

export function sanitizeStudioPlaygroundState(
  value: unknown,
): StudioPlaygroundPersistedState {
  const { settingsByType, type: persistedType } = isRecord(value)
    ? value
    : ({} as Record<string, unknown>);
  const persistedSettings = isRecord(settingsByType) ? settingsByType : {};

  return {
    settingsByType: STUDIO_PLAYGROUND_TYPES.reduce((accumulator, type) => {
      accumulator[type] = sanitizeStudioPlaygroundSettings(
        type,
        persistedSettings[type],
      );
      return accumulator;
    }, {} as StudioPlaygroundSettingsByType),
    type: resolveStudioPlaygroundType(persistedType),
  };
}

export function readStudioPlaygroundState(): StudioPlaygroundPersistedState {
  if (typeof window === 'undefined') {
    return getDefaultStudioPlaygroundState();
  }

  try {
    const raw = window.localStorage.getItem(STUDIO_PLAYGROUND_STORAGE_KEY);
    if (!raw) {
      return getDefaultStudioPlaygroundState();
    }
    return sanitizeStudioPlaygroundState(JSON.parse(raw));
  } catch {
    return getDefaultStudioPlaygroundState();
  }
}

export function writeStudioPlaygroundState(
  state: StudioPlaygroundPersistedState,
): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const settingsByType = { ...state.settingsByType };
    for (const type of STUDIO_PLAYGROUND_TYPES) {
      settingsByType[type] = {
        ...state.settingsByType[type],
        crunControls: sanitizeStudioPlaygroundSettings(
          type,
          state.settingsByType[type],
        ).crunControls,
      };
    }
    window.localStorage.setItem(
      STUDIO_PLAYGROUND_STORAGE_KEY,
      JSON.stringify({ ...state, settingsByType }),
    );
  } catch {
    // Persistence is a convenience — a full or blocked store must not break
    // the composer.
  }
}
