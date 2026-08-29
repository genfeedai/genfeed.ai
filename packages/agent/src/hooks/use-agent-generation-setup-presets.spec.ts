import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { RouterPriority } from '@genfeedai/enums';
import type { IStudioLook } from '@genfeedai/interfaces';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  agentPresetToGenerationSetupValues,
  useAgentGenerationSetupPresets,
} from './use-agent-generation-setup-presets';

const findForAssetType = vi.fn();
const post = vi.fn();
const removeLook = vi.fn();

const { brandState } = vi.hoisted(() => ({
  brandState: {
    brandId: '',
    organizationId: '',
  },
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => brandState,
}));

vi.mock('@services/content/studio-looks.service', () => ({
  StudioLooksService: {
    getInstance: () => ({ findForAssetType, post, removeLook }),
  },
}));

function apiServiceStub(): AgentApiService {
  return {
    getToken: vi.fn().mockResolvedValue('token'),
  } as unknown as AgentApiService;
}

function studioLook(overrides: Partial<IStudioLook> = {}): IStudioLook {
  return {
    aspectRatio: '1:1',
    assetType: 'image',
    brandId: 'brand-1',
    brandingMode: 'brand',
    camera: '',
    cameraMovement: null,
    createdAt: new Date().toISOString(),
    duration: null,
    id: 'preset-1',
    isDeleted: false,
    isPromptEnhanceEnabled: true,
    label: 'Preset one',
    lens: '',
    lighting: '',
    modelKey: null,
    mood: '',
    organizationId: 'org-1',
    outputs: 1,
    prioritize: RouterPriority.BALANCED,
    promptTemplate: '',
    resolution: null,
    scene: '',
    style: '',
    updatedAt: new Date().toISOString(),
    userId: 'user-1',
    ...overrides,
  };
}

describe('useAgentGenerationSetupPresets', () => {
  beforeEach(() => {
    findForAssetType.mockReset();
    post.mockReset();
    removeLook.mockReset();
    brandState.brandId = 'brand-1';
    brandState.organizationId = 'org-1';
  });

  it('does not fetch until loadPresets is called', () => {
    findForAssetType.mockResolvedValue([]);
    renderHook(() => useAgentGenerationSetupPresets(apiServiceStub(), 'image'));

    expect(findForAssetType).not.toHaveBeenCalled();
  });

  it('loads presets scoped to the asset type on demand', async () => {
    const look = studioLook();
    findForAssetType.mockResolvedValue([look]);

    const { result } = renderHook(() =>
      useAgentGenerationSetupPresets(apiServiceStub(), 'image'),
    );

    act(() => {
      result.current.loadPresets();
    });

    await waitFor(() => expect(result.current.isPresetsLoading).toBe(false));
    expect(result.current.presets).toEqual([look]);
    expect(findForAssetType).toHaveBeenCalledWith(
      'image',
      expect.any(AbortSignal),
    );
  });

  it('is a no-op on a second call within the same org+brand+type scope', async () => {
    findForAssetType.mockResolvedValue([]);

    const { result } = renderHook(() =>
      useAgentGenerationSetupPresets(apiServiceStub(), 'image'),
    );

    act(() => {
      result.current.loadPresets();
    });
    await waitFor(() => expect(result.current.isPresetsLoading).toBe(false));

    act(() => {
      result.current.loadPresets();
    });

    expect(findForAssetType).toHaveBeenCalledTimes(1);
  });

  it('refetches when the org/brand/type scope changes', async () => {
    findForAssetType.mockResolvedValue([]);

    const { result, rerender } = renderHook(
      ({ type }: { type: 'image' | 'video' }) =>
        useAgentGenerationSetupPresets(apiServiceStub(), type),
      { initialProps: { type: 'image' } },
    );

    act(() => {
      result.current.loadPresets();
    });
    await waitFor(() => expect(result.current.isPresetsLoading).toBe(false));

    rerender({ type: 'video' });
    act(() => {
      result.current.loadPresets();
    });
    await waitFor(() => expect(result.current.isPresetsLoading).toBe(false));

    expect(findForAssetType).toHaveBeenCalledTimes(2);
    expect(findForAssetType).toHaveBeenNthCalledWith(
      2,
      'video',
      expect.any(AbortSignal),
    );
  });

  it('does not fetch without a resolved org+brand scope', () => {
    brandState.brandId = '';
    brandState.organizationId = '';
    findForAssetType.mockResolvedValue([]);

    const { result } = renderHook(() =>
      useAgentGenerationSetupPresets(apiServiceStub(), 'image'),
    );

    act(() => {
      result.current.loadPresets();
    });

    expect(findForAssetType).not.toHaveBeenCalled();
  });

  it('saves a preset and prepends it to the list', async () => {
    const created = studioLook({ id: 'preset-new', label: 'New preset' });
    post.mockResolvedValue(created);

    const { result } = renderHook(() =>
      useAgentGenerationSetupPresets(apiServiceStub(), 'image'),
    );

    let saveResult = false;
    await act(async () => {
      saveResult = await result.current.savePreset('New preset', {
        aspectRatio: '1:1',
        brandingMode: 'brand',
        isPromptEnhanceEnabled: true,
        modelKey: '',
        outputs: 1,
        prioritize: RouterPriority.BALANCED,
        type: 'image',
      });
    });

    expect(saveResult).toBe(true);
    expect(result.current.presets).toEqual([created]);
  });

  it('rejects saving a blank label without calling the API', async () => {
    const { result } = renderHook(() =>
      useAgentGenerationSetupPresets(apiServiceStub(), 'image'),
    );

    let saveResult = true;
    await act(async () => {
      saveResult = await result.current.savePreset('   ', {
        aspectRatio: '1:1',
        brandingMode: 'brand',
        isPromptEnhanceEnabled: true,
        modelKey: '',
        outputs: 1,
        prioritize: RouterPriority.BALANCED,
        type: 'image',
      });
    });

    expect(saveResult).toBe(false);
    expect(post).not.toHaveBeenCalled();
  });

  it('returns false and logs when saving fails', async () => {
    post.mockRejectedValue(new Error('network error'));

    const { result } = renderHook(() =>
      useAgentGenerationSetupPresets(apiServiceStub(), 'image'),
    );

    let saveResult = true;
    await act(async () => {
      saveResult = await result.current.savePreset('New preset', {
        aspectRatio: '1:1',
        brandingMode: 'brand',
        isPromptEnhanceEnabled: true,
        modelKey: '',
        outputs: 1,
        prioritize: RouterPriority.BALANCED,
        type: 'image',
      });
    });

    expect(saveResult).toBe(false);
  });

  it('deletes a preset and removes it from the list', async () => {
    const look = studioLook();
    findForAssetType.mockResolvedValue([look]);
    removeLook.mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAgentGenerationSetupPresets(apiServiceStub(), 'image'),
    );

    act(() => {
      result.current.loadPresets();
    });
    await waitFor(() => expect(result.current.presets).toEqual([look]));

    let deleteResult = false;
    await act(async () => {
      deleteResult = await result.current.deletePreset(look.id);
    });

    expect(deleteResult).toBe(true);
    expect(result.current.presets).toEqual([]);
    expect(removeLook).toHaveBeenCalledWith(look.id);
  });

  it('returns false and logs when deletion fails', async () => {
    removeLook.mockRejectedValue(new Error('network error'));

    const { result } = renderHook(() =>
      useAgentGenerationSetupPresets(apiServiceStub(), 'image'),
    );

    let deleteResult = true;
    await act(async () => {
      deleteResult = await result.current.deletePreset('preset-1');
    });

    expect(deleteResult).toBe(false);
  });
});

describe('agentPresetToGenerationSetupValues', () => {
  it('projects shared fields regardless of asset type', () => {
    const preset = studioLook({
      aspectRatio: '4:5',
      brandingMode: 'off',
      camera: 'wide',
      isPromptEnhanceEnabled: false,
      modelKey: 'flux-schnell',
      outputs: 3,
      prioritize: RouterPriority.QUALITY,
    });

    const patch = agentPresetToGenerationSetupValues(preset);

    expect(patch).toMatchObject({
      aspectRatio: '4:5',
      brandingMode: 'off',
      camera: 'wide',
      isPromptEnhanceEnabled: false,
      modelKey: 'flux-schnell',
      outputs: 3,
      prioritize: RouterPriority.QUALITY,
    });
  });

  it('omits video-only fields for an image preset', () => {
    const preset = studioLook({
      assetType: 'image',
      cameraMovement: 'dolly-in',
      duration: 8,
    });

    const patch = agentPresetToGenerationSetupValues(preset);

    expect(patch.cameraMovement).toBeUndefined();
    expect(patch.duration).toBeUndefined();
  });

  it('includes video-only fields for a video preset', () => {
    const preset = studioLook({
      assetType: 'video',
      cameraMovement: 'dolly-in',
      duration: 8,
    });

    const patch = agentPresetToGenerationSetupValues(preset);

    expect(patch.cameraMovement).toBe('dolly-in');
    expect(patch.duration).toBe(8);
  });

  it('leaves falsy optional text fields undefined', () => {
    const preset = studioLook({
      camera: '',
      lens: '',
      lighting: '',
      mood: '',
      promptTemplate: '',
      scene: '',
      style: '',
    });

    const patch = agentPresetToGenerationSetupValues(preset);

    expect(patch.camera).toBeUndefined();
    expect(patch.lens).toBeUndefined();
    expect(patch.lighting).toBeUndefined();
    expect(patch.mood).toBeUndefined();
    expect(patch.promptTemplate).toBeUndefined();
    expect(patch.scene).toBeUndefined();
    expect(patch.style).toBeUndefined();
  });
});
