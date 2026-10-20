import { RouterPriority } from '@genfeedai/contracts';
import { useStudioPlaygroundSettings } from '@pages/studio/playground/hooks/useStudioPlaygroundSettings';
import {
  generationSetupValuesToStudioSettingsPatch,
  getDefaultGenerationSetupValues,
  STUDIO_BRIDGED_SETTINGS_KEYS,
  STUDIO_RESIDUAL_SETTINGS_KEYS,
  splitStudioSettingsPatch,
  studioSettingsFieldsToGenerationSetupPatch,
} from '@pages/studio/playground/utils/studio-generation-setup-bridge';
import { getDefaultStudioPlaygroundSettings } from '@pages/studio/playground/utils/studio-playground-settings';
import { act, renderHook, waitFor } from '@testing-library/react';
import { AUTO_MODEL_OPTION_VALUE } from '@ui/dropdowns/model-selector/model-selector.constants';
import { describe, expect, it } from 'vitest';

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
    const defaults = getDefaultStudioPlaygroundSettings('image');

    expect(getDefaultGenerationSetupValues('image')).toEqual({
      aspectRatio: defaults.aspectRatio,
      brandingMode: defaults.brandingMode,
      camera: defaults.camera,
      cameraMovement: defaults.cameraMovement,
      duration: defaults.duration,
      isPromptEnhanceEnabled: true,
      lens: defaults.lens,
      lighting: defaults.lighting,
      modelKey: '',
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
      modelKey: '',
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

  it('maps brandingMode straight through regardless of isPromptEnhanceEnabled (#4676 FR3)', () => {
    const enabledPatch = generationSetupValuesToStudioSettingsPatch({
      ...values,
      brandingMode: 'brand',
      isPromptEnhanceEnabled: true,
    });
    expect(enabledPatch.brandingMode).toBe('brand');

    const disabledPatch = generationSetupValuesToStudioSettingsPatch({
      ...values,
      brandingMode: 'brand',
      isPromptEnhanceEnabled: false,
    });
    expect(disabledPatch.brandingMode).toBe('brand');

    const offPatch = generationSetupValuesToStudioSettingsPatch({
      ...values,
      brandingMode: 'off',
      isPromptEnhanceEnabled: true,
    });
    expect(offPatch.brandingMode).toBe('off');
  });

  it('omits fields the setup left undefined', () => {
    const patch = generationSetupValuesToStudioSettingsPatch({
      ...values,
      camera: undefined,
    });

    expect(patch).not.toHaveProperty('camera');
  });

  it('writes Auto back as the Studio persist sentinel', () => {
    const patch = generationSetupValuesToStudioSettingsPatch({
      ...values,
      modelKey: '',
    });

    expect(patch.modelKey).toBe(AUTO_MODEL_OPTION_VALUE);
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

  it('preserves explicit identity clears while leaving omitted fields unchanged', () => {
    const { residual } = splitStudioSettingsPatch({
      avatarRef: undefined,
      avatarPhotoUrl: undefined,
    });
    expect(residual).toEqual({
      avatarRef: undefined,
      avatarPhotoUrl: undefined,
    });
    expect(residual).not.toHaveProperty('voiceRef');
    const voiceClear = splitStudioSettingsPatch({
      voiceRef: undefined,
      voiceId: undefined,
    });
    expect(voiceClear.residual).toEqual({
      voiceRef: undefined,
      voiceId: undefined,
    });
    expect(voiceClear.residual).not.toHaveProperty('avatarRef');
  });

  it('clears avatar and voice selections through the real settings hook independently', async () => {
    const { result } = renderHook(() => useStudioPlaygroundSettings());
    await waitFor(() => expect(result.current.isHydrated).toBe(true));
    act(() =>
      result.current.applyTypeSettings('avatar', {
        avatarPhotoUrl: 'https://assets.test/photo.jpg',
        voiceId: 'voice-a',
      }),
    );
    expect(result.current.settings.avatarPhotoUrl).toBe(
      'https://assets.test/photo.jpg',
    );
    act(() =>
      result.current.updateSettings({
        avatarPhotoUrl: undefined,
        avatarRef: undefined,
      }),
    );
    expect(result.current.settings.avatarPhotoUrl).toBeUndefined();
    expect(result.current.settings.voiceId).toBe('voice-a');
    act(() =>
      result.current.updateSettings({
        voiceId: undefined,
        voiceRef: undefined,
      }),
    );
    expect(result.current.settings.voiceId).toBeUndefined();
    expect(result.current.settingsByType.avatar.avatarPhotoUrl).toBeUndefined();
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
