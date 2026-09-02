import type { IImage, IVideo } from '@genfeedai/contracts/interfaces';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ────────────────────────────────────────────────────────────
// Mocks — everything outside the hook. `@genfeedai/client/schemas`
// is deliberately left real: the pending/failed predicates are part
// of what these tests cover.
// ────────────────────────────────────────────────────────────

const {
  mergeProgress,
  mockImagesFindOne,
  mockNotifyError,
  mockNotifyInfo,
  mockNotifySuccess,
  mockNotifyWarning,
  mockSetGeneratedAssetId,
  mockVideosPost,
  mockVideosPostMerge,
  searchParams,
} = vi.hoisted(() => ({
  mergeProgress: { options: null } as {
    options: {
      ingredientId?: string;
      onComplete?: () => void;
      onError?: (error: string) => void;
    } | null;
  },
  mockImagesFindOne: vi.fn(),
  mockNotifyError: vi.fn(),
  mockNotifyInfo: vi.fn(),
  mockNotifySuccess: vi.fn(),
  mockNotifyWarning: vi.fn(),
  mockSetGeneratedAssetId: vi.fn(),
  mockVideosPost: vi.fn(),
  mockVideosPostMerge: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useSearchParams: () => searchParams,
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ brandId: 'brand-1' }),
}));

vi.mock('@contexts/ui/asset-selection.context', () => ({
  useAssetSelection: () => ({ setGeneratedAssetId: mockSetGeneratedAssetId }),
}));

vi.mock('@hooks/data/elements/use-elements/use-elements', () => ({
  useElements: () => ({
    videoModels: [{ isDefault: true, key: 'video-model-1' }],
  }),
}));

// The real useAuthedService returns a stable useCallback. The mock must be
// referentially stable too — the deep-link seeding effect lists the getter in
// its deps, and an unstable identity re-runs the effect mid-fetch, cancelling
// the in-flight request while the seeded-ref guard blocks a retry.
vi.mock('@hooks/auth/use-authed-service/use-authed-service', async () => {
  const { useCallback, useRef } = await import('react');
  return {
    useAuthedService: <T>(factory: (token: string) => T) => {
      const factoryRef = useRef(factory);
      factoryRef.current = factory;
      return useCallback(async () => factoryRef.current('stub-token'), []);
    },
  };
});

interface MergeProgressOptions {
  ingredientId?: string;
  onComplete?: () => void;
  onError?: (error: string) => void;
}

vi.mock('@hooks/storyboard/use-merge-progress/use-merge-progress', () => ({
  useMergeProgress: (options: MergeProgressOptions) => {
    mergeProgress.options = options;
    return {
      overallProgress: options.ingredientId ? 40 : 0,
      steps: options.ingredientId
        ? [
            {
              id: 'download',
              label: 'Downloading videos',
              status: 'active' as const,
            },
          ]
        : [],
    };
  },
}));

vi.mock('@pages/studio/generate/hooks/useStoryboardGeneration', () => ({
  useStoryboardGeneration: () => ({
    cameraMovementPreset: undefined,
    clearStoryboard: vi.fn(),
    customCameraPrompt: '',
    frames: [],
    handleGenerateStoryboard: vi.fn(),
    hasInterpolationModel: true,
    isStoryboardGenerating: false,
    setCameraMovementPreset: vi.fn(),
    setCustomCameraPrompt: vi.fn(),
    setFrames: vi.fn(),
  }),
}));

vi.mock('@services/ingredients/videos.service', () => ({
  VideosService: {
    getInstance: () => ({
      post: mockVideosPost,
      postMerge: mockVideosPostMerge,
    }),
  },
}));

vi.mock('@services/ingredients/images.service', () => ({
  ImagesService: { getInstance: () => ({ findOne: mockImagesFindOne }) },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: mockNotifyError,
      info: mockNotifyInfo,
      success: mockNotifySuccess,
      warning: mockNotifyWarning,
    }),
  },
}));

import { useStoryboardWorkspace } from './use-storyboard-workspace';

// ────────────────────────────────────────────────────────────
// Fixtures
// ────────────────────────────────────────────────────────────

function makeImage(id: string): IImage {
  return {
    id,
    ingredientUrl: `https://cdn.test/${id}.png`,
    thumbnailUrl: `https://cdn.test/${id}-thumb.png`,
  } as unknown as IImage;
}

type Workspace = ReturnType<typeof useStoryboardWorkspace>;

/**
 * Seed N scenes that `getPendingFrames` accepts (prompt >= 10 chars).
 */
async function seedScenes(
  result: { current: Workspace },
  count: number,
): Promise<void> {
  await act(async () => {
    result.current.addSceneImages(
      Array.from({ length: count }, (_, index) => makeImage(`image-${index}`)),
    );
  });
  await act(async () => {
    for (const frame of result.current.storyboard.frames) {
      result.current.updateSceneFrame(frame.id, {
        prompt: `Scene ${frame.order} prompt copy`,
      });
    }
  });
}

describe('useStoryboardWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mergeProgress.options = null;
    mockVideosPost.mockResolvedValue({
      id: 'video-1',
      ingredientUrl: 'https://cdn.test/video-1.mp4',
      thumbnailUrl: 'https://cdn.test/video-1-thumb.png',
    });
    mockVideosPostMerge.mockResolvedValue({ id: 'merged-1' });
  });

  describe('scene generation reliability', () => {
    it('marks only the failing frame as failed and warns about the partial run', async () => {
      const { result } = renderHook(() => useStoryboardWorkspace());
      await seedScenes(result, 3);

      mockVideosPost
        .mockResolvedValueOnce({ id: 'video-a' })
        .mockRejectedValueOnce(new Error('Provider rejected the prompt'))
        .mockResolvedValueOnce({ id: 'video-c' });

      await act(async () => {
        await result.current.generatePendingScenes();
      });

      const statuses = result.current.storyboard.frames.map(
        (frame) => frame.status,
      );
      expect(statuses).toEqual(['completed', 'failed', 'completed']);
      expect(result.current.storyboard.frames[1]?.error).toBe(
        'Provider rejected the prompt',
      );
      expect(result.current.failedSceneCount).toBe(1);
      expect(result.current.completedSceneCount).toBe(2);
      expect(mockNotifyWarning).toHaveBeenCalledWith(
        'Generated 2 of 3 scenes · 1 failed — retry the failed ones',
      );
      expect(mockNotifySuccess).not.toHaveBeenCalled();
    });

    it('reports an error instead of success when every frame fails', async () => {
      const { result } = renderHook(() => useStoryboardWorkspace());
      await seedScenes(result, 2);

      mockVideosPost.mockRejectedValue(new Error('Model unavailable'));

      await act(async () => {
        await result.current.generatePendingScenes();
      });

      expect(mockNotifyError).toHaveBeenCalledWith(
        'All 2 scenes failed — check the errors and retry',
      );
      expect(mockNotifySuccess).not.toHaveBeenCalled();
      expect(result.current.failedSceneCount).toBe(2);
    });

    it('retries only the failed frames', async () => {
      const { result } = renderHook(() => useStoryboardWorkspace());
      await seedScenes(result, 3);

      mockVideosPost
        .mockResolvedValueOnce({ id: 'video-a' })
        .mockRejectedValueOnce(new Error('Transient upstream error'))
        .mockResolvedValueOnce({ id: 'video-c' });

      await act(async () => {
        await result.current.generatePendingScenes();
      });
      expect(result.current.failedSceneCount).toBe(1);

      mockVideosPost.mockClear();
      mockVideosPost.mockResolvedValue({ id: 'video-b-retry' });

      await act(async () => {
        await result.current.retryFailedScenes();
      });

      expect(mockVideosPost).toHaveBeenCalledTimes(1);
      expect(mockVideosPost.mock.calls[0]?.[0]).toMatchObject({
        text: 'Scene 1 prompt copy',
      });
      expect(result.current.failedSceneCount).toBe(0);
      expect(result.current.completedSceneCount).toBe(3);
    });

    it('retries a single frame on demand', async () => {
      const { result } = renderHook(() => useStoryboardWorkspace());
      await seedScenes(result, 2);

      mockVideosPost.mockRejectedValue(new Error('Boom'));
      await act(async () => {
        await result.current.generatePendingScenes();
      });

      mockVideosPost.mockClear();
      mockVideosPost.mockResolvedValue({ id: 'video-retry' });
      const targetId = result.current.storyboard.frames[0]?.id as string;

      await act(async () => {
        await result.current.retrySceneFrame(targetId);
      });

      expect(mockVideosPost).toHaveBeenCalledTimes(1);
      expect(result.current.storyboard.frames[0]?.status).toBe('completed');
      expect(result.current.storyboard.frames[1]?.status).toBe('failed');
    });

    it('cancels mid-generation, stops issuing requests, and restores the batch', async () => {
      const { result } = renderHook(() => useStoryboardWorkspace());
      await seedScenes(result, 3);

      // Never settles on its own — only the AbortSignal ends it, which is how a
      // real long-running generation behaves.
      mockVideosPost.mockImplementation(
        (_body: unknown, signal?: AbortSignal) =>
          new Promise((_resolve, reject) => {
            signal?.addEventListener('abort', () =>
              reject(new Error('canceled')),
            );
          }),
      );

      let generation: Promise<void> | undefined;
      act(() => {
        generation = result.current.generatePendingScenes();
      });

      await waitFor(() => expect(mockVideosPost).toHaveBeenCalledTimes(1));
      expect(result.current.isGeneratingScenes).toBe(true);
      expect(result.current.sceneProgress).toEqual({ current: 1, total: 3 });

      await act(async () => {
        result.current.cancelSceneGeneration();
        await generation;
      });

      // Only the in-flight frame was ever requested.
      expect(mockVideosPost).toHaveBeenCalledTimes(1);
      expect(result.current.isGeneratingScenes).toBe(false);
      expect(result.current.sceneProgress).toBeNull();
      expect(
        result.current.storyboard.frames.every(
          (frame) => frame.status === 'pending',
        ),
      ).toBe(true);
      expect(result.current.pendingSceneCount).toBe(3);
      expect(mockNotifyInfo).toHaveBeenCalledWith(
        'Scene generation cancelled · 0 of 3 generated',
      );
    });

    it('passes an AbortSignal to every scene request', async () => {
      const { result } = renderHook(() => useStoryboardWorkspace());
      await seedScenes(result, 1);

      await act(async () => {
        await result.current.generatePendingScenes();
      });

      expect(mockVideosPost.mock.calls[0]?.[1]).toBeInstanceOf(AbortSignal);
    });

    it('refuses a second run while one is in flight', async () => {
      const { result } = renderHook(() => useStoryboardWorkspace());
      await seedScenes(result, 2);

      mockVideosPost.mockImplementation(
        (_body: unknown, signal?: AbortSignal) =>
          new Promise((_resolve, reject) => {
            signal?.addEventListener('abort', () =>
              reject(new Error('canceled')),
            );
          }),
      );

      let generation: Promise<void> | undefined;
      act(() => {
        generation = result.current.generatePendingScenes();
      });
      await waitFor(() => expect(mockVideosPost).toHaveBeenCalledTimes(1));

      await act(async () => {
        await result.current.generatePendingScenes();
      });
      expect(mockVideosPost).toHaveBeenCalledTimes(1);

      await act(async () => {
        result.current.cancelSceneGeneration();
        await generation;
      });
    });

    it('aborts the in-flight request when the workspace unmounts', async () => {
      const { result, unmount } = renderHook(() => useStoryboardWorkspace());
      await seedScenes(result, 2);

      let capturedSignal: AbortSignal | undefined;
      mockVideosPost.mockImplementation(
        (_body: unknown, signal?: AbortSignal) => {
          capturedSignal = signal;
          return new Promise((_resolve, reject) => {
            signal?.addEventListener('abort', () =>
              reject(new Error('canceled')),
            );
          });
        },
      );

      let generation: Promise<void> | undefined;
      act(() => {
        generation = result.current.generatePendingScenes();
      });
      await waitFor(() => expect(mockVideosPost).toHaveBeenCalledTimes(1));

      unmount();
      await act(async () => {
        await generation;
      });

      expect(capturedSignal?.aborted).toBe(true);
      // Unmounted: no toast, no state write.
      expect(mockNotifyInfo).not.toHaveBeenCalled();
    });
  });

  describe('merge flow', () => {
    async function generateTwoScenes(result: { current: Workspace }) {
      await seedScenes(result, 2);
      mockVideosPost
        .mockResolvedValueOnce({ id: 'video-a' })
        .mockResolvedValueOnce({ id: 'video-b' });
      await act(async () => {
        await result.current.generatePendingScenes();
      });
    }

    it('stays in the merging state until the socket reports completion', async () => {
      const { result } = renderHook(() => useStoryboardWorkspace());
      await generateTwoScenes(result);

      await act(async () => {
        await result.current.mergeStoryboardVideos();
      });

      // The POST only enqueues the job — the render is still running.
      expect(result.current.isMerging).toBe(true);
      expect(result.current.mergeSteps).toHaveLength(1);
      expect(result.current.mergeProgress).toBe(40);

      await act(async () => {
        mergeProgress.options?.onComplete?.();
      });

      expect(result.current.isMerging).toBe(false);
      expect(mockNotifySuccess).toHaveBeenCalledWith('Merged video is ready');
    });

    it('clears the merging state when the socket reports an error', async () => {
      const { result } = renderHook(() => useStoryboardWorkspace());
      await generateTwoScenes(result);

      await act(async () => {
        await result.current.mergeStoryboardVideos();
      });
      await act(async () => {
        mergeProgress.options?.onError?.('Encoder crashed');
      });

      expect(result.current.isMerging).toBe(false);
      expect(mockNotifyError).toHaveBeenCalledWith('Encoder crashed');
    });

    it('does not strand the UI in merging when the response carries no id', async () => {
      const { result } = renderHook(() => useStoryboardWorkspace());
      await generateTwoScenes(result);
      mockVideosPostMerge.mockResolvedValueOnce({});

      await act(async () => {
        await result.current.mergeStoryboardVideos();
      });

      expect(result.current.isMerging).toBe(false);
    });

    it('sends the workspace merge settings with the scene merge', async () => {
      const { result } = renderHook(() => useStoryboardWorkspace());
      await generateTwoScenes(result);

      await act(async () => {
        result.current.updateMergeSettings({
          isCaptionsEnabled: true,
          transitionDuration: 1.2,
        });
      });
      await act(async () => {
        await result.current.mergeStoryboardVideos();
      });

      expect(mockVideosPostMerge).toHaveBeenCalledWith(
        expect.objectContaining({
          ids: ['video-a', 'video-b'],
          isCaptionsEnabled: true,
          transitionDuration: 1.2,
        }),
      );
    });

    it('sends the same merge settings when merging hand-picked videos', async () => {
      const { result } = renderHook(() => useStoryboardWorkspace());

      await act(async () => {
        result.current.addMergeVideos([
          { id: 'picked-1' },
          { id: 'picked-2' },
        ] as unknown as IVideo[]);
      });
      await act(async () => {
        result.current.updateMergeSettings({ isCaptionsEnabled: true });
      });
      await act(async () => {
        await result.current.mergeSelectedVideos();
      });

      expect(mockVideosPostMerge).toHaveBeenCalledWith(
        expect.objectContaining({
          ids: ['picked-1', 'picked-2'],
          isCaptionsEnabled: true,
        }),
      );
    });

    it('lets the user stop watching a merge whose socket went quiet', async () => {
      const { result } = renderHook(() => useStoryboardWorkspace());
      await generateTwoScenes(result);

      await act(async () => {
        await result.current.mergeStoryboardVideos();
      });
      expect(result.current.isMerging).toBe(true);

      await act(async () => {
        result.current.dismissMergeProgress();
      });

      expect(result.current.isMerging).toBe(false);
      expect(result.current.mergeSteps).toHaveLength(0);
    });

    it('refuses to merge the storyboard before two scenes completed', async () => {
      const { result } = renderHook(() => useStoryboardWorkspace());

      await act(async () => {
        await result.current.mergeStoryboardVideos();
      });

      expect(mockVideosPostMerge).not.toHaveBeenCalled();
      expect(mockNotifyError).toHaveBeenCalledWith(
        'Generate at least two completed scene videos before merging',
      );
    });

    it('surfaces a merge request failure and leaves the merging state', async () => {
      const { result } = renderHook(() => useStoryboardWorkspace());
      await generateTwoScenes(result);
      mockVideosPostMerge.mockRejectedValueOnce(new Error('queue full'));

      await act(async () => {
        await result.current.mergeStoryboardVideos();
      });

      expect(result.current.isMerging).toBe(false);
      expect(mockNotifyError).toHaveBeenCalled();
    });
  });

  describe('merge video pick list', () => {
    it('adds videos once, removes and clears them', async () => {
      const { result } = renderHook(() => useStoryboardWorkspace());

      await act(async () => {
        result.current.addMergeVideos([
          { id: 'video-1' },
          { id: 'video-2' },
        ] as unknown as IVideo[]);
      });
      await act(async () => {
        result.current.addMergeVideos([
          { id: 'video-1' },
          { id: 'video-3' },
        ] as unknown as IVideo[]);
      });
      expect(result.current.mergeVideoIds.map((video) => video.id)).toEqual([
        'video-1',
        'video-2',
        'video-3',
      ]);

      await act(async () => {
        result.current.removeMergeVideo('video-2');
      });
      expect(result.current.mergeVideoIds.map((video) => video.id)).toEqual([
        'video-1',
        'video-3',
      ]);

      await act(async () => {
        result.current.clearMergeVideos();
      });
      expect(result.current.mergeVideoIds).toEqual([]);
    });

    it('refuses to merge fewer than two selected videos', async () => {
      const { result } = renderHook(() => useStoryboardWorkspace());

      await act(async () => {
        result.current.addMergeVideos([
          { id: 'video-1' },
        ] as unknown as IVideo[]);
      });
      await act(async () => {
        await result.current.mergeSelectedVideos();
      });

      expect(mockVideosPostMerge).not.toHaveBeenCalled();
      expect(mockNotifyError).toHaveBeenCalledWith(
        'Select at least two videos to merge',
      );
    });

    it('surfaces selected-video merge failures', async () => {
      const { result } = renderHook(() => useStoryboardWorkspace());
      mockVideosPostMerge.mockRejectedValueOnce(new Error('boom'));

      await act(async () => {
        result.current.addMergeVideos([
          { id: 'video-1' },
          { id: 'video-2' },
        ] as unknown as IVideo[]);
      });
      await act(async () => {
        await result.current.mergeSelectedVideos();
      });

      expect(result.current.isMerging).toBe(false);
      expect(mockNotifyError).toHaveBeenCalled();
    });

    it('does not strand merging when a selected merge returns no id', async () => {
      const { result } = renderHook(() => useStoryboardWorkspace());
      mockVideosPostMerge.mockResolvedValueOnce({});

      await act(async () => {
        result.current.addMergeVideos([
          { id: 'video-1' },
          { id: 'video-2' },
        ] as unknown as IVideo[]);
      });
      await act(async () => {
        await result.current.mergeSelectedVideos();
      });

      expect(result.current.isMerging).toBe(false);
    });
  });

  describe('scene frame management', () => {
    it('removes a frame and renumbers the remaining orders', async () => {
      const { result } = renderHook(() => useStoryboardWorkspace());
      await seedScenes(result, 3);

      const removedId = result.current.storyboard.frames[0]?.id as string;
      await act(async () => {
        result.current.removeSceneFrame(removedId);
      });

      expect(result.current.storyboard.frames).toHaveLength(2);
      expect(
        result.current.storyboard.frames.map((frame) => frame.order),
      ).toEqual([0, 1]);
    });

    it('clears all scenes', async () => {
      const { result } = renderHook(() => useStoryboardWorkspace());
      await seedScenes(result, 2);

      await act(async () => {
        result.current.clearScenes();
      });

      expect(result.current.storyboard.frames).toHaveLength(0);
    });

    it('does not add duplicate scene images', async () => {
      const { result } = renderHook(() => useStoryboardWorkspace());

      await act(async () => {
        result.current.addSceneImages([makeImage('image-0')]);
      });
      await act(async () => {
        result.current.addSceneImages([makeImage('image-0')]);
      });

      expect(result.current.storyboard.frames).toHaveLength(1);
    });
  });

  describe('deep-link scene seeding', () => {
    it('seeds a scene from a referenceImageId url param', async () => {
      searchParams.set('referenceImageId', 'image-seed');
      mockImagesFindOne.mockResolvedValue(makeImage('image-seed'));

      const { result } = renderHook(() => useStoryboardWorkspace());

      await waitFor(() => {
        expect(result.current.storyboard.frames).toHaveLength(1);
      });
      expect(result.current.mode).toBe('scenes');
      expect(mockNotifySuccess).toHaveBeenCalledWith(
        'Image added to storyboard scenes',
      );
      searchParams.delete('referenceImageId');
    });

    it('notifies when the deep-linked image cannot be loaded', async () => {
      searchParams.set('referenceImageId', 'image-broken');
      mockImagesFindOne.mockRejectedValue(new Error('not found'));

      const { result } = renderHook(() => useStoryboardWorkspace());

      await waitFor(() => {
        expect(mockNotifyError).toHaveBeenCalledWith(
          'Failed to load image for storyboard',
        );
      });
      expect(result.current.storyboard.frames).toHaveLength(0);
      searchParams.delete('referenceImageId');
    });
  });
});
