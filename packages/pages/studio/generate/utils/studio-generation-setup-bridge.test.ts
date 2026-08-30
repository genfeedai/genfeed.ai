import { RouterPriority } from '@genfeedai/enums';
import { getDefaultStudioGenerateSettings } from '@pages/studio/generate/utils/studio-generate-settings';
import type { StudioGeneratePersistedState } from '@pages/studio/generate/utils/studio-generate-storage';
import { STUDIO_GENERATE_TYPES } from '@pages/studio/generate/utils/studio-generate-types';
import {
  generationSetupValuesToStudioSettingsPatch,
  getDefaultGenerationSetupValues,
  STUDIO_BRIDGED_SETTINGS_KEYS,
  STUDIO_RESIDUAL_SETTINGS_KEYS,
  seedGenerationSetupFromLegacyStudioSettings,
  splitStudioSettingsPatch,
  studioSettingsFieldsToGenerationSetupPatch,
} from '@pages/studio/generate/utils/studio-generation-setup-bridge';
import {
  buildStudioGenerationSetupScope,
  useGenerationSetupStore,
} from '@ui/dropdowns/generation-setup/generation-setup.store';
import { beforeEach, describe, expect, it } from 'vitest';

const settings = {
  aspectRatio: '1:1',
  blacklist: [],
  brandingMode: 'brand' as const,
  isAudioEnabled: false,
  modelKey: 'auto',
  outputs: 1,
  prioritize: RouterPriority.BALANCED,
  resolution: '1K',
  tags: [],
};

describe('getDefaultGenerationSetupValues', () => {
  it('mirrors the Studio defaults for the bridged fields plus the setup-only fields', () => {
    const defaults = getDefaultStudioGenerateSettings('image');

    expect(getDefaultGenerationSetupValues('image')).toEqual({
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
      type: 'image',
    });
  });
});

describe('studioSettingsFieldsToGenerationSetupPatch', () => {
  it('projects only the bridged fields present on the legacy settings', () => {
    const patch = studioSettingsFieldsToGenerationSetupPatch({
      ...settings,
      camera: 'low angle',
      style: 'cinematic',
    });

    expect(patch).toEqual({
      aspectRatio: '1:1',
      brandingMode: 'brand',
      camera: 'low angle',
      modelKey: 'auto',
      outputs: 1,
      prioritize: RouterPriority.BALANCED,
      resolution: '1K',
      style: 'cinematic',
    });
  });

  it('never leaks a residual-only field into the patch', () => {
    const patch = studioSettingsFieldsToGenerationSetupPatch({
      ...settings,
      folder: 'my-folder',
      voiceId: 'voice-1',
    });

    for (const key of STUDIO_RESIDUAL_SETTINGS_KEYS) {
      expect(patch).not.toHaveProperty(key);
    }
  });
});

describe('generationSetupValuesToStudioSettingsPatch', () => {
  const values = getDefaultGenerationSetupValues('video');

  it('keeps the raw brandingMode preference when enhancement is enabled', () => {
    const patch = generationSetupValuesToStudioSettingsPatch({
      ...values,
      brandingMode: 'brand',
      isPromptEnhanceEnabled: true,
    });

    expect(patch.brandingMode).toBe('brand');
  });

  it("collapses brandingMode to 'off' when enhancement is disabled, without mutating the raw preference", () => {
    const patch = generationSetupValuesToStudioSettingsPatch({
      ...values,
      brandingMode: 'brand',
      isPromptEnhanceEnabled: false,
    });

    expect(patch.brandingMode).toBe('off');
  });

  it('omits fields the setup left undefined', () => {
    const patch = generationSetupValuesToStudioSettingsPatch({
      ...values,
      camera: undefined,
    });

    expect(patch).not.toHaveProperty('camera');
  });
});

describe('splitStudioSettingsPatch', () => {
  it('routes bridged and residual keys to their respective buckets', () => {
    const { bridged, residual } = splitStudioSettingsPatch({
      folder: 'my-folder',
      style: 'cinematic',
      voiceId: 'voice-1',
    });

    expect(bridged).toEqual({ style: 'cinematic' });
    expect(residual).toEqual({ folder: 'my-folder', voiceId: 'voice-1' });
  });

  it('drops keys whose patch value is undefined', () => {
    const { bridged, residual } = splitStudioSettingsPatch({
      folder: undefined,
      style: undefined,
    });

    expect(bridged).toEqual({});
    expect(residual).toEqual({});
  });

  it('accounts for every bridged key declared by the module', () => {
    const patch = Object.fromEntries(
      STUDIO_BRIDGED_SETTINGS_KEYS.map((key) => [key, 'value']),
    );

    const { bridged, residual } = splitStudioSettingsPatch(patch);

    expect(Object.keys(bridged).sort()).toEqual(
      [...STUDIO_BRIDGED_SETTINGS_KEYS].sort(),
    );
    expect(residual).toEqual({});
  });
});

function buildPersistedState(
  overrides: Partial<
    Record<
      (typeof STUDIO_GENERATE_TYPES)[number],
      ReturnType<typeof getDefaultStudioGenerateSettings>
    >
  > = {},
): StudioGeneratePersistedState {
  const settingsByType = STUDIO_GENERATE_TYPES.reduce(
    (accumulator, type) => {
      accumulator[type] =
        overrides[type] ?? getDefaultStudioGenerateSettings(type);
      return accumulator;
    },
    {} as StudioGeneratePersistedState['settingsByType'],
  );

  return { settingsByType, type: 'image' };
}

describe('seedGenerationSetupFromLegacyStudioSettings', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useGenerationSetupStore.setState({ reasonsByScope: {}, setupByScope: {} });
  });

  it('skips a type entirely when the legacy settings match the shared defaults', () => {
    seedGenerationSetupFromLegacyStudioSettings(buildPersistedState());

    expect(useGenerationSetupStore.getState().setupByScope).toEqual({});
  });

  it('migrates only the fields that diverge from the shared defaults, marking them user-owned', () => {
    const imageDefaults = getDefaultStudioGenerateSettings('image');
    const legacyState = buildPersistedState({
      image: { ...imageDefaults, style: 'cinematic' },
    });

    seedGenerationSetupFromLegacyStudioSettings(legacyState);

    const scope = buildStudioGenerationSetupScope('image');
    const setup = useGenerationSetupStore.getState().setupByScope[scope];

    expect(setup).toBeDefined();
    expect(setup?.values.style).toBe('cinematic');
    expect(setup?.sources.style).toBe('user');
    // A field that matched the default was never touched — it stays agent-owned.
    expect(setup?.sources.aspectRatio).toBeUndefined();
    expect(setup?.values.aspectRatio).toBe(imageDefaults.aspectRatio);
  });

  it('never clobbers a scope that already has a persisted setup', () => {
    const scope = buildStudioGenerationSetupScope('image');
    const existing = {
      sources: { style: 'preset' as const },
      values: {
        ...getDefaultGenerationSetupValues('image'),
        style: 'preset-style',
      },
    };
    useGenerationSetupStore.setState({
      setupByScope: { [scope]: existing },
    });

    const imageDefaults = getDefaultStudioGenerateSettings('image');
    const legacyState = buildPersistedState({
      image: { ...imageDefaults, style: 'cinematic' },
    });

    seedGenerationSetupFromLegacyStudioSettings(legacyState);

    expect(useGenerationSetupStore.getState().setupByScope[scope]).toBe(
      existing,
    );
  });

  it('migrates independently per type, leaving unrelated scopes untouched', () => {
    const videoDefaults = getDefaultStudioGenerateSettings('video');
    const legacyState = buildPersistedState({
      video: { ...videoDefaults, outputs: 4 },
    });

    seedGenerationSetupFromLegacyStudioSettings(legacyState);

    const videoScope = buildStudioGenerationSetupScope('video');
    const imageScope = buildStudioGenerationSetupScope('image');
    const setupByScope = useGenerationSetupStore.getState().setupByScope;

    expect(setupByScope[videoScope]?.values.outputs).toBe(4);
    expect(setupByScope[videoScope]?.sources.outputs).toBe('user');
    expect(setupByScope[imageScope]).toBeUndefined();
  });
});
