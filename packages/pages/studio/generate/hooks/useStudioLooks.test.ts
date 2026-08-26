import { RouterPriority } from '@genfeedai/enums';
import type {
  IStudioLook,
  StudioGenerateSettings,
} from '@genfeedai/interfaces';
import {
  buildStudioLookPayload,
  studioLookToSettingsPatch,
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

const settings: StudioGenerateSettings = {
  aspectRatio: '1:1',
  blacklist: [],
  brandingMode: 'brand',
  camera: 'camera-1',
  cameraMovement: 'move-1',
  isAudioEnabled: false,
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
  tags: [],
  voiceId: 'voice-1',
};

const look: IStudioLook = {
  assetType: 'video',
  brandId: 'brand-a',
  camera: 'saved-camera',
  cameraMovement: 'saved-move',
  createdAt: '2026-08-26T00:00:00.000Z',
  id: 'look-a',
  isDeleted: false,
  label: 'Saved',
  lens: 'saved-lens',
  lighting: 'saved-lighting',
  mood: 'saved-mood',
  organizationId: 'org-1',
  promptTemplate: 'saved-preset',
  scene: 'saved-scene',
  style: 'saved-style',
  updatedAt: '2026-08-26T00:00:00.000Z',
  userId: 'user-1',
};

describe('Studio Look settings contract', () => {
  it('captures every Look field without any Output, Identity, model, or prompt field', () => {
    expect(buildStudioLookPayload(' Saved ', 'video', settings)).toEqual({
      assetType: 'video',
      camera: 'camera-1',
      cameraMovement: 'move-1',
      label: 'Saved',
      lens: 'lens-1',
      lighting: 'lighting-1',
      mood: 'mood-1',
      promptTemplate: 'preset-1',
      scene: 'scene-1',
      style: 'style-1',
    });
  });

  it('applies every Look field and no unrelated composer setting', () => {
    expect(studioLookToSettingsPatch(look)).toEqual({
      camera: 'saved-camera',
      cameraMovement: 'saved-move',
      lens: 'saved-lens',
      lighting: 'saved-lighting',
      mood: 'saved-mood',
      promptTemplate: 'saved-preset',
      scene: 'saved-scene',
      style: 'saved-style',
    });
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
});
