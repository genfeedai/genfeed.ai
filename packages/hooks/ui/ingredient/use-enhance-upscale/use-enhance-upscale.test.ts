import { IngredientCategory } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { quoteTopazVideoUpscaleCredits } from '@genfeedai/pricing';
import { useEnhanceUpscale } from '@hooks/ui/ingredient/use-enhance-upscale/use-enhance-upscale';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
const mockPostUpscale = vi.fn();
const mockSuccess = vi.fn();
const mockError = vi.fn();
const mockUseElements = vi.hoisted(() => vi.fn());

const defaultElements = {
  imageEditModels: [
    {
      cost: 10,
      key: MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE,
      name: 'Topaz Image Upscale',
    },
  ],
  videoEditModels: [
    {
      cost: 20,
      key: MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE,
      label: 'Topaz Video Upscale',
    },
    {
      cost: 30,
      key: MODEL_KEYS.REPLICATE_BYTEDANCE_VIDEO_UPSCALER,
      label: 'ByteDance Video Upscaler',
    },
  ],
};

vi.mock('@hooks/data/elements/use-elements/use-elements', () => ({
  useElements: mockUseElements,
}));

vi.mock('@hooks/utils/service-operation/service-operation.util', () => ({
  executeSilentWithActionState: vi.fn(async ({ operation, onSuccess }) => {
    const result = await operation();
    if (onSuccess) {
      await onSuccess(result);
    }
    return result;
  }),
  executeWithActionState: vi.fn(async ({ operation, onSuccess }) => {
    const result = await operation();
    if (onSuccess) {
      await onSuccess(result);
    }
    return result;
  }),
}));

vi.mock('@genfeedai/services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(() => ({
      error: mockError,
      success: mockSuccess,
    })),
  },
}));

vi.mock('@genfeedai/utils/media/ingredient-type.util', () => ({
  isImageIngredient: vi.fn(
    (ing: Partial<IIngredient>) => ing.category === IngredientCategory.IMAGE,
  ),
  isVideoIngredient: vi.fn(
    (ing: Partial<IIngredient>) => ing.category === IngredientCategory.VIDEO,
  ),
}));

vi.mock('@helpers/formatting/format/format.helper', () => ({
  formatNumberWithCommas: vi.fn((num: number) => num.toLocaleString()),
}));

describe('useEnhanceUpscale', () => {
  const mockSetActionStates = vi.fn();
  const mockOnRefresh = vi.fn();
  const mockGetVideosService = vi
    .fn()
    .mockResolvedValue({ postUpscale: mockPostUpscale });
  const mockGetImagesService = vi
    .fn()
    .mockResolvedValue({ postUpscale: mockPostUpscale });

  const defaultParams = {
    getImagesService: mockGetImagesService,
    getVideosService: mockGetVideosService,
    onRefresh: mockOnRefresh,
    setActionStates: mockSetActionStates,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseElements.mockReturnValue(defaultElements);
    mockPostUpscale.mockResolvedValue({ id: 'new-ingredient' });
  });

  describe('Initial State', () => {
    it('returns all expected functions and state', () => {
      const { result } = renderHook(() => useEnhanceUpscale(defaultParams));

      expect(typeof result.current.handleUpscale).toBe('function');
      expect(typeof result.current.handleEnhance).toBe('function');
      expect(typeof result.current.executeUpscale).toBe('function');
      expect(typeof result.current.executeEnhance).toBe('function');
      expect(typeof result.current.clearUpscaleConfirm).toBe('function');
      expect(typeof result.current.clearEnhanceConfirm).toBe('function');
      expect(result.current.upscaleConfirmData).toBeNull();
      expect(result.current.enhanceConfirmData).toBeNull();
      expect(result.current.upscaleConfirmMessage).toBe('');
      expect(result.current.enhanceConfirmMessage).toBe('');
    });
  });

  describe('handleUpscale', () => {
    it('sets upscale confirm data for image ingredient', async () => {
      const ingredient: Partial<IIngredient> = {
        category: IngredientCategory.IMAGE,
        id: 'img-123',
      };

      const { result } = renderHook(() => useEnhanceUpscale(defaultParams));

      await act(async () => {
        await result.current.handleUpscale(ingredient as IIngredient);
      });

      expect(result.current.upscaleConfirmData).toEqual({
        cost: 10,
        ingredient,
        modelKey: MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE,
      });
    });

    it('sets upscale confirm data for video ingredient', async () => {
      const ingredient: Partial<IIngredient> = {
        category: IngredientCategory.VIDEO,
        id: 'vid-123',
      };

      const { result } = renderHook(() => useEnhanceUpscale(defaultParams));

      await act(async () => {
        await result.current.handleUpscale(ingredient as IIngredient);
      });

      expect(result.current.upscaleConfirmData).toEqual({
        cost: 20,
        ingredient,
        modelKey: MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE,
        videoModelOptions: [
          {
            cost: 20,
            fps: [15, 24, 30, 60],
            key: MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE,
            label: 'Topaz Video Upscale',
            resolutions: ['720p', '1080p', '4k'],
          },
          {
            cost: 30,
            fps: [24, 30, 60, 120],
            key: MODEL_KEYS.REPLICATE_BYTEDANCE_VIDEO_UPSCALER,
            label: 'ByteDance Video Upscaler',
            resolutions: ['720p', '1080p', '2k', '4k'],
          },
        ],
      });
    });

    it('uses ByteDance when it is the only active video upscale model', async () => {
      mockUseElements.mockReturnValue({
        imageEditModels: defaultElements.imageEditModels,
        videoEditModels: [defaultElements.videoEditModels[1]],
      });
      const ingredient: Partial<IIngredient> = {
        category: IngredientCategory.VIDEO,
        id: 'vid-bytedance',
      };
      const { result } = renderHook(() => useEnhanceUpscale(defaultParams));

      await act(async () => {
        await result.current.handleUpscale(ingredient as IIngredient);
      });
      await act(async () => {
        await result.current.executeUpscale();
      });

      expect(mockPostUpscale).toHaveBeenCalledWith('vid-bytedance', {
        model: MODEL_KEYS.REPLICATE_BYTEDANCE_VIDEO_UPSCALER,
        targetFps: 30,
        targetResolution: '1080p',
      });
    });

    it('shows error for unsupported ingredient type', async () => {
      const ingredient: Partial<IIngredient> = {
        category: IngredientCategory.AUDIO,
        id: 'audio-123',
      };

      const { result } = renderHook(() => useEnhanceUpscale(defaultParams));

      await act(async () => {
        await result.current.handleUpscale(ingredient as IIngredient);
      });

      expect(mockError).toHaveBeenCalledWith(
        'Cannot upscale this ingredient type',
      );
      expect(result.current.upscaleConfirmData).toBeNull();
    });
  });

  describe('handleEnhance', () => {
    it('sets enhance confirm data for image ingredient', async () => {
      const ingredient: Partial<IIngredient> = {
        category: IngredientCategory.IMAGE,
        id: 'img-123',
      };

      const { result } = renderHook(() => useEnhanceUpscale(defaultParams));

      await act(async () => {
        await result.current.handleEnhance(ingredient as IIngredient);
      });

      expect(result.current.enhanceConfirmData).toEqual({
        cost: 10,
        ingredient,
        modelKey: MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE,
      });
    });

    it('sets enhance confirm data for video ingredient', async () => {
      const ingredient: Partial<IIngredient> = {
        category: IngredientCategory.VIDEO,
        id: 'vid-123',
      };

      const { result } = renderHook(() => useEnhanceUpscale(defaultParams));

      await act(async () => {
        await result.current.handleEnhance(ingredient as IIngredient);
      });

      expect(result.current.enhanceConfirmData).toEqual({
        cost: 20,
        ingredient,
        modelKey: MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE,
      });
    });

    it('shows error for unsupported ingredient type', async () => {
      const ingredient: Partial<IIngredient> = {
        category: IngredientCategory.AUDIO,
        id: 'audio-123',
      };

      const { result } = renderHook(() => useEnhanceUpscale(defaultParams));

      await act(async () => {
        await result.current.handleEnhance(ingredient as IIngredient);
      });

      expect(mockError).toHaveBeenCalledWith(
        'Can only enhance images and videos',
      );
    });
  });

  describe('executeUpscale', () => {
    it('executes image upscale with correct parameters', async () => {
      const ingredient: Partial<IIngredient> = {
        category: IngredientCategory.IMAGE,
        id: 'img-123',
      };

      const { result } = renderHook(() => useEnhanceUpscale(defaultParams));

      // First trigger the upscale to set confirm data
      await act(async () => {
        await result.current.handleUpscale(ingredient as IIngredient);
      });

      // Then execute
      await act(async () => {
        await result.current.executeUpscale();
      });

      expect(mockGetImagesService).toHaveBeenCalled();
      expect(mockPostUpscale).toHaveBeenCalledWith('img-123', {
        faceEnhancement: true,
        model: MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE,
        subjectDetection: 'Foreground',
        upscaleFactor: '4x',
      });
      expect(result.current.upscaleConfirmData).toBeNull();
    });

    it('executes video upscale with correct parameters', async () => {
      const ingredient: Partial<IIngredient> = {
        category: IngredientCategory.VIDEO,
        id: 'vid-123',
      };

      const { result } = renderHook(() => useEnhanceUpscale(defaultParams));

      await act(async () => {
        await result.current.handleUpscale(ingredient as IIngredient);
      });

      await act(async () => {
        await result.current.executeUpscale();
      });

      expect(mockGetVideosService).toHaveBeenCalled();
      expect(mockPostUpscale).toHaveBeenCalledWith('vid-123', {
        model: MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE,
        targetFps: 30,
        targetResolution: '1080p',
      });
    });

    it('dispatches the selected video upscale model and 4K target', async () => {
      const ingredient: Partial<IIngredient> = {
        category: IngredientCategory.VIDEO,
        id: 'vid-4k',
      };
      const { result } = renderHook(() => useEnhanceUpscale(defaultParams));

      await act(async () => {
        await result.current.handleUpscale(ingredient as IIngredient);
      });
      await act(async () => {
        await result.current.executeUpscale({
          cost: 30,
          model: MODEL_KEYS.REPLICATE_BYTEDANCE_VIDEO_UPSCALER,
          targetFps: 60,
          targetResolution: '4k',
        });
      });

      expect(mockPostUpscale).toHaveBeenCalledWith('vid-4k', {
        model: MODEL_KEYS.REPLICATE_BYTEDANCE_VIDEO_UPSCALER,
        targetFps: 60,
        targetResolution: '4k',
      });
    });

    it('does nothing when no confirm data is set', async () => {
      const { result } = renderHook(() => useEnhanceUpscale(defaultParams));

      await act(async () => {
        await result.current.executeUpscale();
      });

      expect(mockPostUpscale).not.toHaveBeenCalled();
    });

    it('calls onRefresh after successful upscale', async () => {
      const ingredient: Partial<IIngredient> = {
        category: IngredientCategory.IMAGE,
        id: 'img-123',
      };

      const { result } = renderHook(() => useEnhanceUpscale(defaultParams));

      await act(async () => {
        await result.current.handleUpscale(ingredient as IIngredient);
      });

      await act(async () => {
        await result.current.executeUpscale();
      });

      expect(mockOnRefresh).toHaveBeenCalled();
    });
  });

  describe('executeEnhance', () => {
    it('executes enhance with correct parameters', async () => {
      const ingredient: Partial<IIngredient> = {
        category: IngredientCategory.IMAGE,
        id: 'img-123',
      };

      const { result } = renderHook(() => useEnhanceUpscale(defaultParams));

      await act(async () => {
        await result.current.handleEnhance(ingredient as IIngredient);
      });

      await act(async () => {
        await result.current.executeEnhance();
      });

      expect(mockGetImagesService).toHaveBeenCalled();
      expect(mockPostUpscale).toHaveBeenCalledWith('img-123', {
        category: IngredientCategory.IMAGE,
        model: MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE,
        parent: 'img-123',
        prompt: 'Enhance image quality using Topaz AI upscaling',
      });
      expect(result.current.enhanceConfirmData).toBeNull();
    });

    it('executes video enhance with correct parameters', async () => {
      const ingredient: Partial<IIngredient> = {
        category: IngredientCategory.VIDEO,
        id: 'vid-123',
      };

      const { result } = renderHook(() => useEnhanceUpscale(defaultParams));

      await act(async () => {
        await result.current.handleEnhance(ingredient as IIngredient);
      });

      await act(async () => {
        await result.current.executeEnhance();
      });

      expect(mockGetVideosService).toHaveBeenCalled();
      expect(mockPostUpscale).toHaveBeenCalledWith('vid-123', {
        category: IngredientCategory.VIDEO,
        model: MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE,
        parent: 'vid-123',
        prompt: 'Enhance image quality using Topaz AI upscaling',
      });
      expect(result.current.enhanceConfirmData).toBeNull();
    });

    it('does nothing when no confirm data is set', async () => {
      const { result } = renderHook(() => useEnhanceUpscale(defaultParams));

      await act(async () => {
        await result.current.executeEnhance();
      });

      expect(mockPostUpscale).not.toHaveBeenCalled();
    });
  });

  describe('transform admission', () => {
    const image = {
      category: IngredientCategory.IMAGE,
      id: 'bound-image',
    } as IIngredient;
    const video = {
      category: IngredientCategory.VIDEO,
      id: 'bound-video',
    } as IIngredient;

    it.each([undefined, null, Number.NaN, Number.POSITIVE_INFINITY, -1])(
      'blocks unknown or invalid image prices (%s) for both operations',
      async (cost) => {
        mockUseElements.mockReturnValue({
          ...defaultElements,
          imageEditModels: [{ ...defaultElements.imageEditModels[0], cost }],
        });
        const { result } = renderHook(() => useEnhanceUpscale(defaultParams));
        await act(async () => {
          await result.current.handleUpscale(image);
        });
        expect(result.current.upscaleConfirmData).toBeNull();
        await act(async () => {
          await result.current.handleEnhance(image);
        });
        expect(result.current.enhanceConfirmData).toBeNull();
        expect(mockError).toHaveBeenCalledWith(
          expect.stringContaining('price unavailable'),
        );
        expect(mockGetImagesService).not.toHaveBeenCalled();
      },
    );

    it('accepts an explicit zero image price', async () => {
      mockUseElements.mockReturnValue({
        ...defaultElements,
        imageEditModels: [{ ...defaultElements.imageEditModels[0], cost: 0 }],
      });
      const { result } = renderHook(() => useEnhanceUpscale(defaultParams));
      await act(async () => {
        await result.current.handleUpscale(image);
      });
      expect(result.current.upscaleConfirmData?.cost).toBe(0);
      await act(async () => {
        await result.current.executeUpscale();
      });
      expect(mockPostUpscale).toHaveBeenCalledTimes(1);
    });

    it('does not substitute ByteDance when Topaz has unknown pricing', async () => {
      mockUseElements.mockReturnValue({
        ...defaultElements,
        videoEditModels: [
          { ...defaultElements.videoEditModels[0], cost: undefined },
          defaultElements.videoEditModels[1],
        ],
      });
      const { result } = renderHook(() => useEnhanceUpscale(defaultParams));
      await act(async () => {
        await result.current.handleUpscale(video);
      });
      expect(result.current.upscaleConfirmData).toBeNull();
      expect(mockError).toHaveBeenCalledWith(
        expect.stringContaining('price unavailable'),
      );
    });

    it('excludes unpriced alternate video models from the confirmation', async () => {
      mockUseElements.mockReturnValue({
        ...defaultElements,
        videoEditModels: [
          defaultElements.videoEditModels[0],
          { ...defaultElements.videoEditModels[1], cost: undefined },
        ],
      });
      const { result } = renderHook(() => useEnhanceUpscale(defaultParams));
      await act(async () => {
        await result.current.handleUpscale(video);
      });
      expect(
        result.current.upscaleConfirmData?.videoModelOptions?.map(
          (model) => model.key,
        ),
      ).toEqual([MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE]);
    });

    it.each(['removed', 'repriced'])(
      'rejects a %s image model at confirmation',
      async (change) => {
        const { result, rerender } = renderHook(() =>
          useEnhanceUpscale(defaultParams),
        );
        await act(async () => {
          await result.current.handleUpscale(image);
        });
        mockUseElements.mockReturnValue({
          ...defaultElements,
          imageEditModels:
            change === 'removed'
              ? []
              : [{ ...defaultElements.imageEditModels[0], cost: 11 }],
        });
        rerender();
        await act(async () => {
          await result.current.executeUpscale();
        });
        expect(mockGetImagesService).not.toHaveBeenCalled();
        expect(mockError).toHaveBeenCalledWith(
          expect.stringContaining('model or price changed'),
        );
        expect(result.current.upscaleConfirmData?.ingredient?.id).toBe(
          image.id,
        );
      },
    );

    it('rejects a removed video model without substituting a remaining model', async () => {
      const { result, rerender } = renderHook(() =>
        useEnhanceUpscale(defaultParams),
      );
      await act(async () => {
        await result.current.handleUpscale(video);
      });
      mockUseElements.mockReturnValue({
        ...defaultElements,
        videoEditModels: [defaultElements.videoEditModels[1]],
      });
      rerender();
      await act(async () => {
        await result.current.executeUpscale();
      });
      expect(mockGetVideosService).not.toHaveBeenCalled();
      expect(mockPostUpscale).not.toHaveBeenCalled();
    });

    it.each([
      {
        model: 'unregistered',
        targetFps: 30,
        targetResolution: '1080p',
        cost: 20,
      },
      {
        model: MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE,
        targetFps: 120,
        targetResolution: '1080p',
        cost: 20,
      },
      {
        model: MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE,
        targetFps: 30,
        targetResolution: '2k',
        cost: 20,
      },
      {
        model: MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE,
        targetFps: 30,
        targetResolution: '1080p',
        cost: Number.NaN,
      },
      {
        model: MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE,
        targetFps: 60,
        targetResolution: '4k',
        cost: 20,
      },
    ])(
      'rejects unsupported settings or an altered selected quote (%j)',
      async (selection) => {
        const { result } = renderHook(() => useEnhanceUpscale(defaultParams));
        await act(async () => {
          await result.current.handleUpscale(video);
        });
        await act(async () => {
          await result.current.executeUpscale(selection);
        });
        expect(mockGetVideosService).not.toHaveBeenCalled();
        expect(mockPostUpscale).not.toHaveBeenCalled();
      },
    );

    it('accepts the shared Topaz quote for a supported 4K/60 selection', async () => {
      const { result } = renderHook(() => useEnhanceUpscale(defaultParams));
      await act(async () => {
        await result.current.handleUpscale(video);
      });
      await act(async () => {
        await result.current.executeUpscale({
          model: MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE,
          targetFps: 60,
          targetResolution: '4k',
          cost: quoteTopazVideoUpscaleCredits(20, '4k', 60),
        });
      });
      expect(mockPostUpscale).toHaveBeenCalledWith(video.id, {
        model: MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE,
        targetFps: 60,
        targetResolution: '4k',
      });
    });

    it('rechecks model admission after asynchronous service resolution', async () => {
      let resolveService:
        | ((service: { postUpscale: typeof mockPostUpscale }) => void)
        | undefined;
      mockGetImagesService.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveService = resolve;
          }),
      );
      const { result, rerender } = renderHook(() =>
        useEnhanceUpscale(defaultParams),
      );
      await act(async () => {
        await result.current.handleUpscale(image);
      });
      const execute = result.current.executeUpscale;
      let request: Promise<void> | undefined;
      act(() => {
        request = execute();
      });
      mockUseElements.mockReturnValue({
        ...defaultElements,
        imageEditModels: [],
      });
      rerender();
      await act(async () => {
        resolveService?.({ postUpscale: mockPostUpscale });
        await expect(request).rejects.toThrow('model or price changed');
      });
      expect(mockPostUpscale).not.toHaveBeenCalled();
      mockUseElements.mockReturnValue(defaultElements);
      rerender();
      await act(async () => {
        await result.current.handleUpscale(image);
      });
      await act(async () => {
        await result.current.executeUpscale();
      });
      expect(mockPostUpscale).toHaveBeenCalledTimes(1);
    });

    it.each(['upscale', 'enhance'] as const)(
      'consumes one %s confirmation and binds its original source',
      async (operation) => {
        let finish: (() => void) | undefined;
        mockPostUpscale.mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              finish = () => resolve({ id: 'derived-image' });
            }),
        );
        const source = { ...image };
        const { result } = renderHook(() => useEnhanceUpscale(defaultParams));
        await act(async () => {
          await (operation === 'upscale'
            ? result.current.handleUpscale
            : result.current.handleEnhance)(source);
        });
        const execute =
          operation === 'upscale'
            ? result.current.executeUpscale
            : result.current.executeEnhance;
        source.id = 'mutated-source';
        let request: Promise<void> | undefined;
        await act(async () => {
          request = execute();
          await execute();
          await result.current.handleUpscale({
            ...image,
            id: 'another-source',
          });
        });
        expect(mockPostUpscale).toHaveBeenCalledTimes(1);
        expect(mockPostUpscale.mock.calls[0][0]).toBe(image.id);
        await act(async () => {
          finish?.();
          await request;
        });
        await act(async () => {
          await execute();
        });
        expect(mockPostUpscale).toHaveBeenCalledTimes(1);
        expect(result.current.upscaleConfirmData).toBeNull();
      },
    );

    it.each(['upscale', 'enhance'] as const)(
      'cannot execute a dismissed %s confirmation from a captured callback',
      async (operation) => {
        const { result } = renderHook(() => useEnhanceUpscale(defaultParams));
        await act(async () => {
          await (operation === 'upscale'
            ? result.current.handleUpscale
            : result.current.handleEnhance)(image);
        });
        const execute =
          operation === 'upscale'
            ? result.current.executeUpscale
            : result.current.executeEnhance;
        act(() => {
          (operation === 'upscale'
            ? result.current.clearUpscaleConfirm
            : result.current.clearEnhanceConfirm)();
        });
        await act(async () => {
          await execute();
        });
        expect(mockGetImagesService).not.toHaveBeenCalled();
      },
    );

    it('rejects a changed Enhance price at confirmation', async () => {
      const { result, rerender } = renderHook(() =>
        useEnhanceUpscale(defaultParams),
      );
      await act(async () => {
        await result.current.handleEnhance(image);
      });
      mockUseElements.mockReturnValue({
        ...defaultElements,
        imageEditModels: [{ ...defaultElements.imageEditModels[0], cost: 11 }],
      });
      rerender();
      await act(async () => {
        await result.current.executeEnhance();
      });
      expect(mockGetImagesService).not.toHaveBeenCalled();
    });

    it.each(['upscale', 'enhance'] as const)(
      'does not dispatch %s after its owner unmounts during service lookup',
      async (operation) => {
        let resolveService:
          | ((service: { postUpscale: typeof mockPostUpscale }) => void)
          | undefined;
        mockGetImagesService.mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveService = resolve;
            }),
        );
        const { result, unmount } = renderHook(() =>
          useEnhanceUpscale(defaultParams),
        );
        await act(async () => {
          await (operation === 'upscale'
            ? result.current.handleUpscale
            : result.current.handleEnhance)(image);
        });
        const execute =
          operation === 'upscale'
            ? result.current.executeUpscale
            : result.current.executeEnhance;
        let request: Promise<void> | undefined;
        act(() => {
          request = execute();
        });
        unmount();
        await act(async () => {
          resolveService?.({ postUpscale: mockPostUpscale });
          await expect(request).rejects.toThrow('model or price changed');
        });
        expect(mockPostUpscale).not.toHaveBeenCalled();
      },
    );

    it('releases the request lock after a failed transformation', async () => {
      mockPostUpscale.mockRejectedValueOnce(new Error('provider unavailable'));
      const { result } = renderHook(() => useEnhanceUpscale(defaultParams));
      await act(async () => {
        await result.current.handleEnhance(image);
      });
      await act(async () => {
        await expect(result.current.executeEnhance()).rejects.toThrow(
          'provider unavailable',
        );
      });
      await act(async () => {
        await result.current.handleEnhance(image);
      });
      await act(async () => {
        await result.current.executeEnhance();
      });
      expect(mockPostUpscale).toHaveBeenCalledTimes(2);
    });
  });

  describe('Clear Functions', () => {
    it('clearUpscaleConfirm clears upscale confirm data', async () => {
      const ingredient: Partial<IIngredient> = {
        category: IngredientCategory.IMAGE,
        id: 'img-123',
      };

      const { result } = renderHook(() => useEnhanceUpscale(defaultParams));

      await act(async () => {
        await result.current.handleUpscale(ingredient as IIngredient);
      });

      expect(result.current.upscaleConfirmData).not.toBeNull();

      act(() => {
        result.current.clearUpscaleConfirm();
      });

      expect(result.current.upscaleConfirmData).toBeNull();
    });

    it('clearEnhanceConfirm clears enhance confirm data', async () => {
      const ingredient: Partial<IIngredient> = {
        category: IngredientCategory.IMAGE,
        id: 'img-123',
      };

      const { result } = renderHook(() => useEnhanceUpscale(defaultParams));

      await act(async () => {
        await result.current.handleEnhance(ingredient as IIngredient);
      });

      expect(result.current.enhanceConfirmData).not.toBeNull();

      act(() => {
        result.current.clearEnhanceConfirm();
      });

      expect(result.current.enhanceConfirmData).toBeNull();
    });
  });

  describe('Confirm Messages', () => {
    it('generates correct upscale confirm message for image', async () => {
      const ingredient: Partial<IIngredient> = {
        category: IngredientCategory.IMAGE,
        id: 'img-123',
      };

      const { result } = renderHook(() => useEnhanceUpscale(defaultParams));

      await act(async () => {
        await result.current.handleUpscale(ingredient as IIngredient);
      });

      expect(result.current.upscaleConfirmMessage).toContain('Upscale');
      expect(result.current.upscaleConfirmMessage).toContain('image');
      expect(result.current.upscaleConfirmMessage).toContain('10');
    });

    it('generates correct upscale confirm message for video', async () => {
      const ingredient: Partial<IIngredient> = {
        category: IngredientCategory.VIDEO,
        id: 'vid-123',
      };

      const { result } = renderHook(() => useEnhanceUpscale(defaultParams));

      await act(async () => {
        await result.current.handleUpscale(ingredient as IIngredient);
      });

      expect(result.current.upscaleConfirmMessage).toContain('Upscale');
      expect(result.current.upscaleConfirmMessage).toContain('video');
      expect(result.current.upscaleConfirmMessage).toContain('20');
    });

    it('generates correct enhance confirm message', async () => {
      const ingredient: Partial<IIngredient> = {
        category: IngredientCategory.IMAGE,
        id: 'img-123',
      };

      const { result } = renderHook(() => useEnhanceUpscale(defaultParams));

      await act(async () => {
        await result.current.handleEnhance(ingredient as IIngredient);
      });

      expect(result.current.enhanceConfirmMessage).toContain('Enhance');
      expect(result.current.enhanceConfirmMessage).toContain('Topaz');
    });

    it('returns empty message when no confirm data', () => {
      const { result } = renderHook(() => useEnhanceUpscale(defaultParams));

      expect(result.current.upscaleConfirmMessage).toBe('');
      expect(result.current.enhanceConfirmMessage).toBe('');
    });
  });
});
