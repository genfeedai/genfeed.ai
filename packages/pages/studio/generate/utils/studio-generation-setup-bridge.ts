/**
 * Bridges the shared Unified Generation Setup store
 * (`@ui/dropdowns/generation-setup/generation-setup.store`) to Studio's
 * existing `StudioGenerateSettings` shape so payload builders in
 * `generation-payloads.ts` and `useStudioGeneration.ts` stay untouched.
 *
 * 15 of `StudioGenerateSettings`'s 20 fields are ~1:1 with
 * `GenerationSetupValues` (the "bridged" fields) and now live in the shared
 * store under the `studio:${type}` scope. The remaining 7 fields
 * (`avatarPhotoUrl`, `blacklist`, `folder`, `isAudioEnabled`, `speech`,
 * `tags`, `voiceId`) have no shared-store equivalent — they stay local
 * ("residual"), persisted exactly as before via `studio-generate-storage`.
 */
import type {
  GenerationSetupSources,
  GenerationSetupValues,
} from '@genfeedai/contracts/interfaces/studio/generation-setup.interface';
import type {
  StudioGenerateSettings,
  StudioGenerateType,
} from '@pages/studio/generate/types';
import { getDefaultStudioGenerateSettings } from '@pages/studio/generate/utils/studio-generate-settings';
import type { StudioGeneratePersistedState } from '@pages/studio/generate/utils/studio-generate-storage';
import { STUDIO_GENERATE_TYPES } from '@pages/studio/generate/utils/studio-generate-types';
import {
  buildStudioGenerationSetupScope,
  useGenerationSetupStore,
} from '@ui/dropdowns/generation-setup/generation-setup.store';

/** Fields present on both shapes — bridged through the shared store. */
export const STUDIO_BRIDGED_SETTINGS_KEYS = [
  'aspectRatio',
  'brandingMode',
  'camera',
  'cameraMovement',
  'duration',
  'lens',
  'lighting',
  'modelKey',
  'mood',
  'outputs',
  'prioritize',
  'promptTemplate',
  'resolution',
  'scene',
  'style',
] as const satisfies readonly (keyof StudioGenerateSettings &
  keyof GenerationSetupValues)[];

/** `StudioGenerateSettings`-only fields — no shared-store equivalent. */
export const STUDIO_RESIDUAL_SETTINGS_KEYS = [
  'avatarPhotoUrl',
  'blacklist',
  'folder',
  'isAudioEnabled',
  'speech',
  'tags',
  'voiceId',
] as const satisfies readonly (keyof StudioGenerateSettings)[];

/** Defaults for a type's shared-store scope, derived from the existing Studio defaults util. */
export function getDefaultGenerationSetupValues(
  type: StudioGenerateType,
): GenerationSetupValues {
  const defaults = getDefaultStudioGenerateSettings(type);

  return {
    aspectRatio: defaults.aspectRatio,
    brandingMode: defaults.brandingMode,
    camera: defaults.camera,
    cameraMovement: defaults.cameraMovement,
    duration: defaults.duration,
    isPromptEnhanceEnabled: true,
    lens: defaults.lens,
    lighting: defaults.lighting,
    modelKey: defaults.modelKey,
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

/** Projects the 15 bridged fields off a legacy `StudioGenerateSettings` — migration-only. */
export function studioSettingsFieldsToGenerationSetupPatch(
  settings: StudioGenerateSettings,
): Partial<GenerationSetupValues> {
  const patch: Partial<GenerationSetupValues> = {};

  for (const key of STUDIO_BRIDGED_SETTINGS_KEYS) {
    const value = settings[key];
    if (value !== undefined) {
      (patch as Record<string, unknown>)[key] = value;
    }
  }

  return patch;
}

/**
 * Projects the shared store's values back onto `StudioGenerateSettings`.
 * `brandingMode` is the *effective* value — enhancement toggled off collapses
 * it to `'off'` at this boundary without mutating the stored raw preference,
 * so `generation-payloads.ts` (which hardcodes `useTemplate: true`) keeps
 * seeing exactly the flag it already knows how to interpret.
 */
export function generationSetupValuesToStudioSettingsPatch(
  values: GenerationSetupValues,
): Partial<StudioGenerateSettings> {
  const patch: Partial<StudioGenerateSettings> = {};

  for (const key of STUDIO_BRIDGED_SETTINGS_KEYS) {
    if (key === 'brandingMode') {
      continue;
    }
    const value = values[key];
    if (value !== undefined) {
      (patch as Record<string, unknown>)[key] = value;
    }
  }

  patch.brandingMode = values.isPromptEnhanceEnabled
    ? values.brandingMode
    : 'off';

  return patch;
}

/** Routes a `StudioGenerateSettings` patch's keys to the shared store vs. local residual state. */
export function splitStudioSettingsPatch(
  patch: Partial<StudioGenerateSettings>,
): {
  bridged: Partial<GenerationSetupValues>;
  residual: Partial<StudioGenerateSettings>;
} {
  const bridged: Partial<GenerationSetupValues> = {};
  const residual: Partial<StudioGenerateSettings> = {};
  const bridgedKeys: readonly string[] = STUDIO_BRIDGED_SETTINGS_KEYS;

  for (const key of Object.keys(patch) as (keyof StudioGenerateSettings)[]) {
    const value = patch[key];
    if (value === undefined) {
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
 * `studio-generate-storage` localStorage state, per type, without ever
 * clobbering a scope that already has a persisted entry.
 *
 * `readStudioGenerateState()` always returns fully-populated defaults for
 * every type, even on a fresh install (`getDefaultStudioGenerateState`), so
 * a blanket seed would wrongly mark every field 'user'-owned and permanently
 * lock out agent recommendations. Instead this is diff-based: a field is
 * migrated as `'user'`-owned only when its legacy value diverges from that
 * type's shared-store default. A type with no divergence is skipped
 * entirely, leaving it agent-owned from a clean slate.
 */
export function seedGenerationSetupFromLegacyStudioSettings(
  legacyState: StudioGeneratePersistedState,
): void {
  const { setupByScope } = useGenerationSetupStore.getState();

  for (const type of STUDIO_GENERATE_TYPES) {
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
        [scope]: { sources, values },
      },
    });
  }
}
