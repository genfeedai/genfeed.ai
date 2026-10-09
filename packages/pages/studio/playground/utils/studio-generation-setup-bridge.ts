/**
 * Bridges the shared Unified Generation Setup store
 * (`@ui/dropdowns/generation-setup/generation-setup.store`) to Studio's
 * existing `StudioPlaygroundSettings` shape so payload builders in
 * `generation-payloads.ts` and `useStudioGeneration.ts` stay untouched.
 *
 * 15 of `StudioPlaygroundSettings`'s 20 fields are ~1:1 with
 * `GenerationSetupValues` (the "bridged" fields) and now live in the shared
 * store under the `studio:${type}` scope. The remaining 7 fields
 * (`avatarPhotoUrl`, `blacklist`, `folder`, `isAudioEnabled`, `speech`,
 * `tags`, `voiceId`) have no shared-store equivalent — they stay local
 * ("residual"), persisted exactly as before via `studio-playground-storage`.
 */
import type {
  GenerationSetupSources,
  GenerationSetupValues,
} from '@genfeedai/contracts/interfaces/studio/generation-setup.interface';
import type {
  StudioPlaygroundSettings,
  StudioPlaygroundType,
} from '@pages/studio/playground/types';
import { getDefaultStudioPlaygroundSettings } from '@pages/studio/playground/utils/studio-playground-settings';
import type { StudioPlaygroundPersistedState } from '@pages/studio/playground/utils/studio-playground-storage';
import { STUDIO_PLAYGROUND_TYPES } from '@pages/studio/playground/utils/studio-playground-types';
import {
  buildStudioGenerationSetupScope,
  normalizeGenerationSetupValues,
  useGenerationSetupStore,
} from '@ui/dropdowns/generation-setup/generation-setup.store';
import {
  toGenerationSetupModelKey,
  toStudioSettingsModelKey,
} from '@ui/dropdowns/model-selector/model-selector.constants';

/** Fields present on both shapes — bridged through the shared store. */
export const STUDIO_BRIDGED_SETTINGS_KEYS = [
  'aspectRatio',
  'brandingMode',
  'camera',
  'cameraMovement',
  'duration',
  'instrumental',
  'lens',
  'lighting',
  'lyrics',
  'modelKey',
  'mood',
  'outputs',
  'prioritize',
  'promptTemplate',
  'resolution',
  'scene',
  'style',
] as const satisfies readonly (keyof StudioPlaygroundSettings &
  keyof GenerationSetupValues)[];

/**
 * Bridged fields a setup may leave empty. Restoring a saved setup clears
 * these when the saved setup has no value, instead of keeping a stale one.
 */
export const STUDIO_CLEARABLE_SETUP_KEYS = [
  'camera',
  'cameraMovement',
  'duration',
  'instrumental',
  'lens',
  'lighting',
  'lyrics',
  'mood',
  'promptTemplate',
  'resolution',
  'scene',
  'style',
] as const satisfies readonly (typeof STUDIO_BRIDGED_SETTINGS_KEYS)[number][];

/** `StudioPlaygroundSettings`-only fields — no shared-store equivalent. */
export const STUDIO_RESIDUAL_SETTINGS_KEYS = [
  'editSize',
  'editSeed',
  'editPrimaryId',
  'avatarPhotoUrl',
  'avatarRef',
  'voiceRef',
  'crunControls',
  'blacklist',
  'folder',
  'isAudioEnabled',
  'speech',
  'tags',
  'voiceId',
] as const satisfies readonly (keyof StudioPlaygroundSettings)[];

/** Defaults for a type's shared-store scope, derived from the existing Studio defaults util. */
export function getDefaultGenerationSetupValues(
  type: StudioPlaygroundType,
): GenerationSetupValues {
  const defaults = getDefaultStudioPlaygroundSettings(type);

  return {
    aspectRatio: defaults.aspectRatio,
    brandingMode: defaults.brandingMode,
    camera: defaults.camera,
    cameraMovement: defaults.cameraMovement,
    duration: defaults.duration,
    instrumental: defaults.instrumental,
    isPromptEnhanceEnabled: true,
    lens: defaults.lens,
    lighting: defaults.lighting,
    lyrics: defaults.lyrics,
    modelKey: toGenerationSetupModelKey(defaults.modelKey),
    mood: defaults.mood,
    outputs: defaults.outputs,
    prioritize: defaults.prioritize,
    promptTemplate: defaults.promptTemplate,
    resolution: defaults.resolution,
    scene: defaults.scene,
    style: defaults.style,
    type,
  };
}

/** Projects the 15 bridged fields off a legacy `StudioPlaygroundSettings` — migration-only. */
export function studioSettingsFieldsToGenerationSetupPatch(
  settings: StudioPlaygroundSettings,
): Partial<GenerationSetupValues> {
  const patch: Partial<GenerationSetupValues> = {};

  for (const key of STUDIO_BRIDGED_SETTINGS_KEYS) {
    const value = settings[key];
    if (value === undefined) {
      continue;
    }
    if (key === 'modelKey' && typeof value === 'string') {
      patch.modelKey = toGenerationSetupModelKey(value);
      continue;
    }
    (patch as Record<string, unknown>)[key] = value;
  }

  return patch;
}

/**
 * Projects the shared store's values back onto `StudioPlaygroundSettings`.
 * `brandingMode` maps straight through: Brand voice is the only thing that
 * decides brand context (#4676 FR3) — it is never collapsed by any
 * enhancement choice, so `generation-payloads.ts` (which hardcodes
 * `useTemplate: true`) keeps seeing exactly the flag it already knows how to
 * interpret. Studio no longer surfaces `isPromptEnhanceEnabled` at all; the
 * shared store still carries the field only because the agent composer's
 * setup popover has not migrated off it yet.
 */
export function generationSetupValuesToStudioSettingsPatch(
  values: GenerationSetupValues,
): Partial<StudioPlaygroundSettings> {
  const patch: Partial<StudioPlaygroundSettings> = {};

  for (const key of STUDIO_BRIDGED_SETTINGS_KEYS) {
    const value = values[key];
    if (
      value === undefined &&
      !(
        values.type === 'music' &&
        ['duration', 'instrumental', 'lyrics'].includes(key)
      )
    ) {
      continue;
    }
    if (key === 'modelKey' && typeof value === 'string') {
      patch.modelKey = toStudioSettingsModelKey(value);
      continue;
    }
    (patch as Record<string, unknown>)[key] = value;
  }

  return patch;
}

/** Routes a `StudioPlaygroundSettings` patch's keys to the shared store vs. local residual state. */
export function splitStudioSettingsPatch(
  patch: Partial<StudioPlaygroundSettings>,
): {
  bridged: Partial<GenerationSetupValues>;
  residual: Partial<StudioPlaygroundSettings>;
} {
  const bridged: Partial<GenerationSetupValues> = {};
  const residual: Partial<StudioPlaygroundSettings> = {};
  const bridgedKeys: readonly string[] = STUDIO_BRIDGED_SETTINGS_KEYS;

  for (const key of Object.keys(patch) as (keyof StudioPlaygroundSettings)[]) {
    const value = patch[key];
    if (
      value === undefined &&
      ![
        'duration',
        'instrumental',
        'lyrics',
        'crunControls',
        'editSeed',
        'avatarRef',
        'avatarPhotoUrl',
        'voiceRef',
        'voiceId',
      ].includes(key)
    ) {
      continue;
    }
    if (bridgedKeys.includes(key)) {
      (bridged as Record<string, unknown>)[key] = value;
    } else {
      (residual as Record<string, unknown>)[key] = value;
    }
  }

  return { bridged, residual };
}

/**
 * One-time migration: seeds the shared store from legacy
 * `studio-playground-storage` localStorage state, per type, without ever
 * clobbering a scope that already has a persisted entry.
 *
 * `readStudioPlaygroundState()` always returns fully-populated defaults for
 * every type, even on a fresh install (`getDefaultStudioPlaygroundState`), so
 * a blanket seed would wrongly mark every field 'user'-owned and permanently
 * lock out agent recommendations. Instead this is diff-based: a field is
 * migrated as `'user'`-owned only when its legacy value diverges from that
 * type's shared-store default. A type with no divergence is skipped
 * entirely, leaving it agent-owned from a clean slate.
 */
export function seedGenerationSetupFromLegacyStudioSettings(
  legacyState: StudioPlaygroundPersistedState,
): void {
  const { setupByScope } = useGenerationSetupStore.getState();

  for (const type of STUDIO_PLAYGROUND_TYPES) {
    const scope = buildStudioGenerationSetupScope(type);
    if (setupByScope[scope]) {
      continue;
    }

    const defaults = getDefaultGenerationSetupValues(type);
    const legacyPatch = studioSettingsFieldsToGenerationSetupPatch(
      legacyState.settingsByType[type],
    );

    const values: GenerationSetupValues = { ...defaults };
    const sources: GenerationSetupSources = {};
    let hasDivergence = false;

    for (const key of STUDIO_BRIDGED_SETTINGS_KEYS) {
      const legacyValue = legacyPatch[key];
      if (legacyValue === undefined || legacyValue === defaults[key]) {
        continue;
      }
      (values as unknown as Record<string, unknown>)[key] = legacyValue;
      sources[key] = 'user';
      hasDivergence = true;
    }

    if (!hasDivergence) {
      continue;
    }

    useGenerationSetupStore.setState({
      setupByScope: {
        ...useGenerationSetupStore.getState().setupByScope,
        [scope]: { sources, values: normalizeGenerationSetupValues(values) },
      },
    });
  }
}
