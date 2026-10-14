import { ModelCategory } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { IModel } from '@genfeedai/contracts/interfaces';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStudioPlaygroundModels } from './useStudioPlaygroundModels';

const mocks = vi.hoisted(() => ({
  findAll: vi.fn(),
  getService: vi.fn(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));
vi.mock('@services/ai/models.service', () => ({
  ModelsService: { getInstance: vi.fn() },
}));

function makeModel(key: string, category: ModelCategory): IModel {
  return { category, isActive: true, key, label: key } as IModel;
}

describe('useStudioPlaygroundModels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getService.mockResolvedValue({ findAll: mocks.findAll });
  });

  it('keeps only speech rows from the VOICE category, dropping avatar rows', async () => {
    mocks.findAll.mockResolvedValue([
      makeModel(MODEL_KEYS.ELEVENLABS_V4, ModelCategory.VOICE),
      makeModel(MODEL_KEYS.HEYGEN_VOICE, ModelCategory.VOICE),
      makeModel('heygen/avatar', ModelCategory.VOICE),
      makeModel('argil/atom', ModelCategory.VOICE),
    ]);

    const { result } = renderHook(() =>
      useStudioPlaygroundModels(ModelCategory.VOICE, 'org-1'),
    );

    await waitFor(() => expect(result.current.isModelCatalogReady).toBe(true));
    expect(result.current.models.map((model) => model.key)).toEqual([
      MODEL_KEYS.ELEVENLABS_V4,
      MODEL_KEYS.HEYGEN_VOICE,
    ]);
    expect(mocks.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        category: ModelCategory.VOICE,
        isActive: true,
        organizationId: 'org-1',
      }),
      expect.any(AbortSignal),
    );
  });

  it('leaves other categories unfiltered', async () => {
    mocks.findAll.mockResolvedValue([
      makeModel('music-a', ModelCategory.MUSIC),
      makeModel('music-b', ModelCategory.MUSIC),
    ]);

    const { result } = renderHook(() =>
      useStudioPlaygroundModels(ModelCategory.MUSIC, 'org-1'),
    );

    await waitFor(() => expect(result.current.isModelCatalogReady).toBe(true));
    expect(result.current.models).toHaveLength(2);
  });

  it('returns an empty catalog without fetching when there is no category', () => {
    const { result } = renderHook(() =>
      useStudioPlaygroundModels(null, 'org-1'),
    );

    expect(result.current.models).toEqual([]);
    expect(result.current.isModelCatalogReady).toBe(false);
    expect(mocks.findAll).not.toHaveBeenCalled();
  });
});
