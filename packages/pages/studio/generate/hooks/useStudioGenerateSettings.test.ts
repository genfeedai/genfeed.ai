import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import {
  getDefaultStudioGenerateState,
  STUDIO_GENERATE_STORAGE_KEY,
} from '@pages/studio/generate/utils/studio-generate-storage';
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  buildStudioGenerationSetupScope,
  useGenerationSetupStore,
} from '@ui/dropdowns/generation-setup/generation-setup.store';
import { beforeEach, describe, expect, it } from 'vitest';
import { useStudioGenerateSettings } from './useStudioGenerateSettings';

describe('useStudioGenerateSettings', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useGenerationSetupStore.setState({ reasonsByScope: {}, setupByScope: {} });
  });

  it('reports hydration only after persisted per-type settings are restored', async () => {
    window.localStorage.setItem(
      STUDIO_GENERATE_STORAGE_KEY,
      JSON.stringify({
        settingsByType: { video: { aspectRatio: '9:16' } },
        type: 'video',
      }),
    );

    const { result } = renderHook(() => useStudioGenerateSettings());

    await waitFor(() => expect(result.current.isHydrated).toBe(true));
    expect(result.current.type).toBe('video');
    expect(result.current.settings.aspectRatio).toBe('9:16');
  });

  it('atomically switches type and writes remix settings into that type bucket', async () => {
    const { result } = renderHook(() => useStudioGenerateSettings());
    await waitFor(() => expect(result.current.isHydrated).toBe(true));

    act(() => {
      result.current.applyTypeSettings('video', {
        aspectRatio: '9:16',
        duration: 8,
        outputs: 3,
      });
    });

    expect(result.current.type).toBe('video');
    expect(result.current.settings).toMatchObject({
      aspectRatio: '9:16',
      duration: 8,
      outputs: 3,
    });
  });
  it('atomically restores music and clears stale fields while Output is unmounted', async () => {
    window.localStorage.setItem(
      STUDIO_GENERATE_STORAGE_KEY,
      JSON.stringify({
        type: 'music',
        settingsByType: {
          music: {
            modelKey: MODEL_KEYS.FAL_ELEVENLABS_MUSIC,
            duration: 90,
            lyrics: 'legacy verse',
            instrumental: false,
          },
        },
      }),
    );
    const { result } = renderHook(() => useStudioGenerateSettings());
    await waitFor(() => expect(result.current.isHydrated).toBe(true));
    expect(result.current.settings.lyrics).toBe('legacy verse');
    act(() =>
      result.current.updateSettings({
        modelKey: MODEL_KEYS.REPLICATE_META_MUSICGEN,
      }),
    );
    expect(result.current.settings).toMatchObject({
      duration: 30,
      instrumental: true,
      lyrics: undefined,
    });
    act(() =>
      result.current.applyTypeSettings('music', {
        lyrics: 'restored verse',
        instrumental: false,
        modelKey: MODEL_KEYS.FAL_ELEVENLABS_MUSIC,
        duration: 90,
      }),
    );
    expect(result.current.settings).toMatchObject({
      duration: 90,
      instrumental: false,
      lyrics: 'restored verse',
    });
    act(() =>
      result.current.updateSettings({
        modelKey: 'auto',
        duration: undefined,
        lyrics: undefined,
        instrumental: undefined,
      }),
    );
    expect(result.current.settings).toMatchObject({
      duration: undefined,
      instrumental: undefined,
      lyrics: undefined,
    });
  });

  it('restores a saved draft for every type and reports all types back', async () => {
    const { result } = renderHook(() => useStudioGenerateSettings());
    await waitFor(() => expect(result.current.isHydrated).toBe(true));
    const saved = getDefaultStudioGenerateState();

    act(() =>
      result.current.restoreSettings({
        settingsByType: {
          ...saved.settingsByType,
          image: {
            ...saved.settingsByType.image,
            aspectRatio: '16:9',
            blacklist: ['blurry'],
          },
          video: { ...saved.settingsByType.video, aspectRatio: '9:16' },
        },
        type: 'video',
      }),
    );

    expect(result.current.type).toBe('video');
    expect(result.current.settings.aspectRatio).toBe('9:16');
    expect(result.current.settingsByType.image).toMatchObject({
      aspectRatio: '16:9',
      blacklist: ['blurry'],
    });
    // Unchanged fields stay default-owned so recommendations still apply.
    const imageSetup =
      useGenerationSetupStore.getState().setupByScope[
        buildStudioGenerationSetupScope('image')
      ];
    expect(imageSetup?.sources.aspectRatio).toBe('user');
    expect(imageSetup?.sources.outputs).toBeUndefined();
  });

  it('clears optional settings the restored draft left empty', async () => {
    const { result } = renderHook(() => useStudioGenerateSettings());
    await waitFor(() => expect(result.current.isHydrated).toBe(true));
    act(() =>
      result.current.updateSettings({
        folder: 'folder-1',
        style: 'noir',
        voiceId: 'voice-1',
      }),
    );
    expect(result.current.settings).toMatchObject({
      folder: 'folder-1',
      style: 'noir',
    });

    // A sanitized draft with no style, folder or voice.
    act(() => result.current.restoreSettings(getDefaultStudioGenerateState()));

    expect(result.current.settings.style).toBeUndefined();
    expect(result.current.settings.folder).toBeUndefined();
    expect(result.current.settings.voiceId).toBeUndefined();
  });
});
