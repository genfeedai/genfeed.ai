import { STUDIO_GENERATE_STORAGE_KEY } from '@pages/studio/generate/utils/studio-generate-storage';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useGenerationSetupStore } from '@ui/dropdowns/generation-setup/generation-setup.store';
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
});
