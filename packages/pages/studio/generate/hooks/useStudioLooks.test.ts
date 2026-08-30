import { RouterPriority } from '@genfeedai/enums';
import type { IStudioLook } from '@genfeedai/interfaces';
import type { GenerationSetupValues } from '@genfeedai/interfaces/studio/generation-setup.interface';
import {
  buildStudioLookPayload,
  presetToGenerationSetupValues,
  useStudioLooks,
} from '@pages/studio/generate/hooks/useStudioLooks';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const brandContext = {
    brandId: 'brand-a',
    organizationId: 'org-1',
  };
  const service = {
    findForAssetType: vi.fn(),
    post: vi.fn(),
    removeLook: vi.fn(),
  };
  return {
    brandContext,
    getService: vi.fn(async () => service),
    service,
  };
});

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => mocks.brandContext,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

const values: GenerationSetupValues = {
  aspectRatio: '1:1',
  brandingMode: 'brand',
  camera: 'camera-1',
  cameraMovement: 'move-1',
  duration: 8,
  isPromptEnhanceEnabled: true,
  lens: 'lens-1',
  lighting: 'lighting-1',
  modelKey: 'model-1',
  mood: 'mood-1',
  outputs: 4,
  prioritize: RouterPriority.BALANCED,
  promptTemplate: 'preset-1',
  resolution: '1K',
  scene: 'scene-1',
  style: 'style-1',
  type: 'video',
};

const look: IStudioLook = {
  aspectRatio: 'saved-aspect',
  assetType: 'video',
  brandId: 'brand-a',
  brandingMode: 'brand',
  camera: 'saved-camera',
  cameraMovement: 'saved-move',
  createdAt: '2026-08-26T00:00:00.000Z',
  duration: 12,
  id: 'look-a',
  isDeleted: false,
  isPromptEnhanceEnabled: false,
  label: 'Saved',
  lens: 'saved-lens',
  lighting: 'saved-lighting',
  modelKey: 'saved-model',
  mood: 'saved-mood',
  organizationId: 'org-1',
  outputs: 2,
  prioritize: RouterPriority.QUALITY,
  promptTemplate: 'saved-preset',
  resolution: 'saved-resolution',
  scene: 'saved-scene',
  style: 'saved-style',
  updatedAt: '2026-08-26T00:00:00.000Z',
  userId: 'user-1',
};

describe('Studio Look preset contract', () => {
  it('captures every widened Preset field from the shared generation-setup values', () => {
    expect(buildStudioLookPayload(' Saved ', 'video', values)).toEqual({
      aspectRatio: '1:1',
      assetType: 'video',
      brandingMode: 'brand',
      camera: 'camera-1',
      cameraMovement: 'move-1',
      duration: 8,
      isPromptEnhanceEnabled: true,
      label: 'Saved',
      lens: 'lens-1',
      lighting: 'lighting-1',
      modelKey: 'model-1',
      mood: 'mood-1',
      outputs: 4,
      prioritize: RouterPriority.BALANCED,
      promptTemplate: 'preset-1',
      resolution: '1K',
      scene: 'scene-1',
      style: 'style-1',
    });
  });

  it('nulls cameraMovement and duration for image Presets', () => {
    const imageValues: GenerationSetupValues = { ...values, type: 'image' };
    const payload = buildStudioLookPayload('Saved', 'image', imageValues);
    expect(payload.cameraMovement).toBeNull();
    expect(payload.duration).toBeNull();
  });

  it('treats an empty modelKey (Auto) as null', () => {
    const autoValues: GenerationSetupValues = { ...values, modelKey: '' };
    expect(buildStudioLookPayload('Saved', 'video', autoValues).modelKey).toBe(
      null,
    );
  });

  it('projects every persisted Preset field back onto generation-setup values', () => {
    expect(presetToGenerationSetupValues(look)).toEqual({
      aspectRatio: 'saved-aspect',
      brandingMode: 'brand',
      camera: 'saved-camera',
      cameraMovement: 'saved-move',
      duration: 12,
      isPromptEnhanceEnabled: false,
      lens: 'saved-lens',
      lighting: 'saved-lighting',
      modelKey: 'saved-model',
      mood: 'saved-mood',
      outputs: 2,
      prioritize: RouterPriority.QUALITY,
      promptTemplate: 'saved-preset',
      resolution: 'saved-resolution',
      scene: 'saved-scene',
      style: 'saved-style',
    });
  });

  it('omits video-only fields when projecting an image Preset', () => {
    const imageLook: IStudioLook = {
      ...look,
      assetType: 'image',
      cameraMovement: 'stale-move',
      duration: 5,
    };
    const patch = presetToGenerationSetupValues(imageLook);
    expect(patch.cameraMovement).toBeUndefined();
    expect(patch.duration).toBeUndefined();
  });
});

describe('useStudioLooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.brandContext.brandId = 'brand-a';
    mocks.service.findForAssetType.mockResolvedValue([look]);
  });

  it('hides the previous brand snapshot immediately when the active brand changes', async () => {
    const { rerender, result } = renderHook(() => useStudioLooks('video'));

    await waitFor(() => expect(result.current.looks).toEqual([look]));

    mocks.brandContext.brandId = 'brand-b';
    mocks.service.findForAssetType.mockReturnValueOnce(new Promise(() => {}));
    rerender();

    expect(result.current.looks).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });

  it('saves a Look built from the full generation-setup values', async () => {
    mocks.service.post.mockResolvedValue(look);
    const { result } = renderHook(() => useStudioLooks('video'));

    await waitFor(() => expect(result.current.looks).toEqual([look]));

    await result.current.saveLook('New Preset', values);

    expect(mocks.service.post).toHaveBeenCalledWith(
      expect.objectContaining({
        aspectRatio: values.aspectRatio,
        isPromptEnhanceEnabled: values.isPromptEnhanceEnabled,
        label: 'New Preset',
        modelKey: values.modelKey,
      }),
    );
  });
});
