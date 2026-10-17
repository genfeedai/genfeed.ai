import type { IImage, IModel } from '@genfeedai/contracts/interfaces';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStoryboardGeneration } from './use-storyboard-generation';

const mocks = vi.hoisted(() => ({
  postBatchInterpolation: vi.fn(),
  notificationError: vi.fn(),
}));

vi.mock('@contexts/ui/asset-selection.context', () => ({
  useAssetSelection: () => ({
    addToGenerationQueue: vi.fn(),
    updateGenerationStatus: vi.fn(),
  }),
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => {
  const service = async () => ({
    postBatchInterpolation: mocks.postBatchInterpolation,
  });
  return { useAuthedService: () => service };
});
vi.mock('@hooks/utils/use-socket-manager/use-socket-manager', () => ({
  useSocketManager: () => ({ subscribe: () => () => undefined }),
}));
vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));
vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: mocks.notificationError,
      success: vi.fn(),
    }),
  },
}));
vi.mock('@pages/studio/storyboard/utils/storyboard-generation', async () => {
  const actual = await vi.importActual<
    typeof import('@pages/studio/storyboard/utils/storyboard-generation')
  >('@pages/studio/storyboard/utils/storyboard-generation');
  return {
    ...actual,
    getStoryboardInterpolationModels: (models: IModel[]) => models,
    resolveStoryboardModelKey: () => 'model-key',
  };
});

const frames = [{ id: 'a' }, { id: 'b' }] as IImage[];

function renderGeneration(onPromptSubmitted: () => void) {
  return renderHook(() =>
    useStoryboardGeneration({
      brandId: 'brand-1',
      currentModels: [{ id: 'm', key: 'model-key' } as IModel],
      findAllAssets: vi.fn().mockResolvedValue(undefined),
      onPromptSubmitted,
      promptConfig: { isValid: true },
      promptText: 'a slow push in',
      setGeneratedAssetId: vi.fn(),
    }),
  );
}

describe('useStoryboardGeneration prompt clearing', () => {
  beforeEach(() => {
    mocks.postBatchInterpolation.mockReset();
    mocks.notificationError.mockReset();
  });

  it('clears the typed prompt once a transition is accepted', async () => {
    mocks.postBatchInterpolation.mockResolvedValue({
      jobs: [{ id: 'job-1', status: 'processing' }],
    });
    const onPromptSubmitted = vi.fn();
    const { result } = renderGeneration(onPromptSubmitted);

    act(() => result.current.setFrames(frames));
    await act(async () => {
      await result.current.handleGenerateStoryboard();
    });

    expect(onPromptSubmitted).toHaveBeenCalledTimes(1);
  });

  it('keeps the typed prompt when generation did not start', async () => {
    mocks.postBatchInterpolation.mockResolvedValue({ jobs: [] });
    const onPromptSubmitted = vi.fn();
    const { result } = renderGeneration(onPromptSubmitted);

    act(() => result.current.setFrames(frames));
    await act(async () => {
      await result.current.handleGenerateStoryboard();
    });

    expect(onPromptSubmitted).not.toHaveBeenCalled();
  });
});
