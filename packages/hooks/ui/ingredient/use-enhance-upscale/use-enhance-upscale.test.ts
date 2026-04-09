import { MODEL_KEYS } from '@genfeedai/constants';
import { IngredientCategory } from '@genfeedai/enums';
import type { IIngredient } from '@genfeedai/interfaces';
import { useEnhanceUpscale } from '@hooks/ui/ingredient/use-enhance-upscale/use-enhance-upscale';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
const mockPostUpscale = vi.fn();
const mockSuccess = vi.fn();
const mockError = vi.fn();

vi.mock('@hooks/data/elements/use-elements/use-elements', () => ({
  useElements: vi.fn(() => ({
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
        name: 'Topaz Video Upscale',
      },
    ],
  })),
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
      expect(mockPostUpscale).toHaveBeenCalled();
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
