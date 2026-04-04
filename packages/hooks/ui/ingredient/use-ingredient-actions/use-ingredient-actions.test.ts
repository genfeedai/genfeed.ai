import type { IIngredient } from '@cloud/interfaces';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  AssetCategory,
  IngredientCategory,
  IngredientFormat,
  IngredientStatus,
} from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useIngredientServices } from '@hooks/data/ingredients/use-ingredient-services/use-ingredient-services';
import { useIngredientActions } from '@hooks/ui/ingredient/use-ingredient-actions/use-ingredient-actions';
import { NotificationsService } from '@services/core/notifications.service';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDownloadIngredient } = vi.hoisted(() => ({
  mockDownloadIngredient: vi.fn(),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: vi.fn(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(),
}));

vi.mock(
  '@hooks/data/ingredients/use-ingredient-services/use-ingredient-services',
  () => ({
    useIngredientServices: vi.fn(),
  }),
);

vi.mock('@hooks/utils/use-socket-manager/use-socket-manager', () => ({
  useSocketManager: vi.fn(() => ({
    subscribe: vi.fn(() => vi.fn()),
  })),
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(),
  },
}));

vi.mock('@utils/media/ingredient-type.util', () => ({
  getIngredientExtension: vi.fn((ingredient) => {
    if (ingredient.category === IngredientCategory.VIDEO) {
      return 'mp4';
    }
    if (ingredient.category === IngredientCategory.IMAGE) {
      return 'jpg';
    }
    return 'unknown';
  }),
  isImageIngredient: vi.fn(
    (ingredient) => ingredient.category === IngredientCategory.IMAGE,
  ),
  isVideoIngredient: vi.fn(
    (ingredient) => ingredient.category === IngredientCategory.VIDEO,
  ),
}));

vi.mock('@hooks/ui/ingredient/use-enhance-upscale/use-enhance-upscale', () => ({
  useEnhanceUpscale: vi.fn(
    ({ getImagesService, getVideosService, onRefresh }) => ({
      clearEnhanceConfirm: vi.fn(),
      clearUpscaleConfirm: vi.fn(),
      enhanceConfirmData: null,
      enhanceConfirmMessage: '',
      executeEnhance: vi.fn(),
      executeUpscale: vi.fn(),
      handleEnhance: vi.fn(),
      handleUpscale: async (ingredient) => {
        try {
          if (ingredient.category === IngredientCategory.VIDEO) {
            const service = await getVideosService();
            await service.postUpscale(ingredient.id, {
              targetFps: 30,
              targetResolution: '1080p',
            });
          }

          if (ingredient.category === IngredientCategory.IMAGE) {
            const service = await getImagesService();
            await service.postUpscale(ingredient.id, {
              enhanceModel: 'High Fidelity V2',
              faceEnhancement: true,
              subjectDetection: 'Foreground',
              upscaleFactor: '4x',
            });
          }

          await onRefresh?.();
        } catch (_error) {
          NotificationsService.getInstance().error(
            'Failed to upscale ingredient',
          );
        }
      },
      upscaleConfirmData: null,
      upscaleConfirmMessage: '',
    }),
  ),
}));

vi.mock('@helpers/media/download/download.helper', () => ({
  downloadIngredient: mockDownloadIngredient,
}));

describe('useIngredientActions', () => {
  const mockVideoIngredient: IIngredient = {
    category: IngredientCategory.VIDEO,
    id: 'ingredient-1',
    ingredientUrl: 'https://example.com/video.mp4',
    metadata: { label: 'Test Video' },
    status: IngredientStatus.VALIDATED,
  } as IIngredient;

  const mockImageIngredient: IIngredient = {
    category: IngredientCategory.IMAGE,
    id: 'ingredient-2',
    ingredientUrl: 'https://example.com/image.jpg',
    metadata: { label: 'Test Image' },
    status: IngredientStatus.VALIDATED,
  } as IIngredient;

  let mockIngredientsService: {
    patch: ReturnType<typeof vi.fn>;
    postClone: ReturnType<typeof vi.fn>;
    vote: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  let mockVideosService: {
    postUpscale: ReturnType<typeof vi.fn>;
    postReverse: ReturnType<typeof vi.fn>;
    postMirror: ReturnType<typeof vi.fn>;
    postGif: ReturnType<typeof vi.fn>;
    postReframe: ReturnType<typeof vi.fn>;
    postCaptions: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
  };
  let mockImagesService: {
    postUpscale: ReturnType<typeof vi.fn>;
  };
  let mockGifsService: {
    post: ReturnType<typeof vi.fn>;
  };
  let mockAssetsService: {
    postFromIngredient: ReturnType<typeof vi.fn>;
  };
  let mockGetIngredientsService: ReturnType<typeof vi.fn>;
  let mockGetVideosService: ReturnType<typeof vi.fn>;
  let mockGetImagesService: ReturnType<typeof vi.fn>;
  let mockGetGifsService: ReturnType<typeof vi.fn>;
  let mockGetAssetsService: ReturnType<typeof vi.fn>;
  let mockNotificationsService: {
    success: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockIngredientsService = {
      delete: vi.fn().mockResolvedValue(undefined),
      patch: vi.fn().mockResolvedValue(undefined),
      postClone: vi.fn().mockResolvedValue(undefined),
      vote: vi.fn().mockResolvedValue(undefined),
    };

    mockVideosService = {
      post: vi.fn().mockResolvedValue(undefined),
      postCaptions: vi.fn().mockResolvedValue(undefined),
      postGif: vi.fn().mockResolvedValue(undefined),
      postMirror: vi.fn().mockResolvedValue(undefined),
      postReframe: vi.fn().mockResolvedValue(undefined),
      postReverse: vi.fn().mockResolvedValue(undefined),
      postUpscale: vi.fn().mockResolvedValue(undefined),
    };

    mockImagesService = {
      postUpscale: vi.fn().mockResolvedValue(undefined),
    };

    mockGifsService = {
      post: vi.fn().mockResolvedValue(undefined),
    };

    mockAssetsService = {
      postFromIngredient: vi.fn().mockResolvedValue({ id: 'asset-1' }),
    };

    mockGetIngredientsService = vi
      .fn()
      .mockResolvedValue(mockIngredientsService);
    mockGetVideosService = vi.fn().mockResolvedValue(mockVideosService);
    mockGetImagesService = vi.fn().mockResolvedValue(mockImagesService);
    mockGetGifsService = vi.fn().mockResolvedValue(mockGifsService);
    mockGetAssetsService = vi.fn().mockResolvedValue(mockAssetsService);

    mockNotificationsService = {
      error: vi.fn(),
      success: vi.fn(),
    };

    (useBrand as ReturnType<typeof vi.fn>).mockReturnValue({
      brandId: 'brand-1',
    });

    (useIngredientServices as ReturnType<typeof vi.fn>).mockReturnValue({
      getGifsService: mockGetGifsService,
      getImagesService: mockGetImagesService,
      getIngredientsService: mockGetIngredientsService,
      getVideosService: mockGetVideosService,
    });

    (useAuthedService as ReturnType<typeof vi.fn>).mockReturnValue(
      mockGetAssetsService,
    );

    (
      NotificationsService.getInstance as ReturnType<typeof vi.fn>
    ).mockReturnValue(mockNotificationsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with default state', () => {
      const { result } = renderHook(() => useIngredientActions());

      expect(result.current.showActions).toBe(false);
      expect(result.current.actionStates.isPublishing).toBe(false);
      expect(result.current.actionStates.isUpscaling).toBe(false);
      expect(result.current.loadingStates.isPublishing).toBe(false);
    });

    it('should initialize with initialPortraiting state', () => {
      const { result } = renderHook(() =>
        useIngredientActions({ initialPortraiting: true }),
      );

      expect(result.current.actionStates.isPortraiting).toBe(true);
    });

    it('should initialize with initialGeneratingCaptions state', () => {
      const { result } = renderHook(() =>
        useIngredientActions({ initialGeneratingCaptions: true }),
      );

      expect(result.current.actionStates.isGeneratingCaptions).toBe(true);
    });
  });

  describe('handlePublish', () => {
    it('should call onPublishIngredient callback', () => {
      const onPublishIngredient = vi.fn();
      const { result } = renderHook(() =>
        useIngredientActions({ onPublishIngredient }),
      );

      act(() => {
        result.current.handlers.handlePublish(mockVideoIngredient);
      });

      expect(onPublishIngredient).toHaveBeenCalledWith(mockVideoIngredient);
    });
  });

  describe('handleMarkArchived', () => {
    it.skip('should archive ingredient successfully', async () => {
      const onRefresh = vi.fn();
      const { result } = renderHook(() => useIngredientActions({ onRefresh }));

      await act(async () => {
        await result.current.handlers.handleMarkArchived(mockVideoIngredient);
      });

      expect(mockIngredientsService.patch).toHaveBeenCalledWith(
        'ingredient-1',
        { status: IngredientStatus.ARCHIVED },
      );
      expect(onRefresh).toHaveBeenCalled();
      expect(result.current.actionStates.isMarkingArchived).toBe(false);
    });

    it('should not update if already archived', async () => {
      const archivedIngredient = {
        ...mockVideoIngredient,
        status: IngredientStatus.ARCHIVED,
      };
      const { result } = renderHook(() => useIngredientActions());

      await act(async () => {
        await result.current.handlers.handleMarkArchived(archivedIngredient);
      });

      expect(mockIngredientsService.patch).not.toHaveBeenCalled();
    });

    it('should handle errors', async () => {
      const error = new Error('Failed to archive');
      mockIngredientsService.patch.mockRejectedValue(error);
      const { result } = renderHook(() => useIngredientActions());

      await act(async () => {
        await result.current.handlers.handleMarkArchived(mockVideoIngredient);
      });

      expect(mockNotificationsService.error).toHaveBeenCalledWith(
        'Failed to archive ingredient',
      );
      expect(result.current.actionStates.isMarkingArchived).toBe(false);
    });
  });

  describe('handleMarkValidated', () => {
    it('should validate ingredient successfully', async () => {
      const onRefresh = vi.fn();
      const unvalidatedIngredient = {
        ...mockVideoIngredient,
        status: IngredientStatus.GENERATED,
      };
      const { result } = renderHook(() => useIngredientActions({ onRefresh }));

      await act(async () => {
        await result.current.handlers.handleMarkValidated(
          unvalidatedIngredient,
        );
      });

      expect(mockIngredientsService.patch).toHaveBeenCalledWith(
        'ingredient-1',
        { status: IngredientStatus.VALIDATED },
      );
      expect(onRefresh).toHaveBeenCalled();
    });

    it('should not update if already validated', async () => {
      const { result } = renderHook(() => useIngredientActions());

      await act(async () => {
        await result.current.handlers.handleMarkValidated(mockVideoIngredient);
      });

      expect(mockIngredientsService.patch).not.toHaveBeenCalled();
    });
  });

  describe('handleMarkRejected', () => {
    it('should reject ingredient successfully', async () => {
      const onRefresh = vi.fn();
      const { result } = renderHook(() => useIngredientActions({ onRefresh }));

      await act(async () => {
        await result.current.handlers.handleMarkRejected(mockVideoIngredient);
      });

      expect(mockIngredientsService.patch).toHaveBeenCalledWith(
        'ingredient-1',
        { status: IngredientStatus.REJECTED },
      );
      expect(onRefresh).toHaveBeenCalled();
    });
  });

  describe('handleUpscale', () => {
    it('should upscale video ingredient', async () => {
      const onRefresh = vi.fn();
      const { result } = renderHook(() => useIngredientActions({ onRefresh }));

      await act(async () => {
        await result.current.handlers.handleUpscale(mockVideoIngredient);
      });

      expect(mockVideosService.postUpscale).toHaveBeenCalledWith(
        'ingredient-1',
        {
          targetFps: 30,
          targetResolution: '1080p',
        },
      );
      expect(onRefresh).toHaveBeenCalled();
      expect(result.current.actionStates.isUpscaling).toBe(false);
    });

    it('should upscale image ingredient', async () => {
      const onRefresh = vi.fn();
      const { result } = renderHook(() => useIngredientActions({ onRefresh }));

      await act(async () => {
        await result.current.handlers.handleUpscale(mockImageIngredient);
      });

      expect(mockImagesService.postUpscale).toHaveBeenCalledWith(
        'ingredient-2',
        {
          enhanceModel: 'High Fidelity V2',
          faceEnhancement: true,
          subjectDetection: 'Foreground',
          upscaleFactor: '4x',
        },
      );
    });

    it('should handle errors', async () => {
      const error = new Error('Upscale failed');
      mockVideosService.postUpscale.mockRejectedValue(error);
      const { result } = renderHook(() => useIngredientActions());

      await act(async () => {
        await result.current.handlers.handleUpscale(mockVideoIngredient);
      });

      expect(mockNotificationsService.error).toHaveBeenCalledWith(
        'Failed to upscale ingredient',
      );
    });
  });

  describe('handleClone', () => {
    it('should clone ingredient successfully', async () => {
      const onRefresh = vi.fn();
      const { result } = renderHook(() => useIngredientActions({ onRefresh }));

      await act(async () => {
        await result.current.handlers.handleClone(mockVideoIngredient);
      });

      expect(mockIngredientsService.postClone).toHaveBeenCalledWith(
        'ingredient-1',
      );
      expect(onRefresh).toHaveBeenCalled();
    });
  });

  describe('handleReverse', () => {
    it('should reverse video successfully', async () => {
      const onRefresh = vi.fn();
      const { result } = renderHook(() => useIngredientActions({ onRefresh }));

      await act(async () => {
        await result.current.handlers.handleReverse(mockVideoIngredient);
      });

      expect(mockVideosService.postReverse).toHaveBeenCalledWith(
        'ingredient-1',
      );
      expect(onRefresh).toHaveBeenCalled();
    });

    it('should show error for non-video ingredient', async () => {
      const { result } = renderHook(() => useIngredientActions());

      await act(async () => {
        await result.current.handlers.handleReverse(mockImageIngredient);
      });

      expect(mockNotificationsService.error).toHaveBeenCalledWith(
        'Can only reverse videos',
      );
      expect(mockVideosService.postReverse).not.toHaveBeenCalled();
    });
  });

  describe('handleMirror', () => {
    it('should mirror video successfully', async () => {
      const onRefresh = vi.fn();
      const { result } = renderHook(() => useIngredientActions({ onRefresh }));

      await act(async () => {
        await result.current.handlers.handleMirror(mockVideoIngredient);
      });

      expect(mockVideosService.postMirror).toHaveBeenCalledWith('ingredient-1');
      expect(onRefresh).toHaveBeenCalled();
    });
  });

  describe('handlePortrait', () => {
    it('should convert video to portrait', async () => {
      const onRefresh = vi.fn();
      const { result } = renderHook(() => useIngredientActions({ onRefresh }));

      await act(async () => {
        await result.current.handlers.handlePortrait(mockVideoIngredient);
      });

      expect(mockVideosService.postReframe).toHaveBeenCalledWith(
        'ingredient-1',
        { format: IngredientFormat.PORTRAIT },
      );
      expect(onRefresh).toHaveBeenCalled();
    });
  });

  describe('handleDownload', () => {
    it('should download ingredient successfully', async () => {
      const { result } = renderHook(() => useIngredientActions());

      await act(async () => {
        await result.current.handlers.handleDownload(mockVideoIngredient);
      });

      expect(mockDownloadIngredient).toHaveBeenCalledWith(mockVideoIngredient);
      expect(mockNotificationsService.success).toHaveBeenCalledWith(
        'Download started',
      );
    });

    it('should show error if no URL available', async () => {
      const ingredientWithoutUrl = {
        ...mockVideoIngredient,
        ingredientUrl: undefined,
      };
      const { result } = renderHook(() => useIngredientActions());

      await act(async () => {
        await result.current.handlers.handleDownload(ingredientWithoutUrl);
      });

      expect(mockNotificationsService.error).toHaveBeenCalledWith(
        'No download URL available',
      );
      expect(mockDownloadIngredient).not.toHaveBeenCalled();
    });
  });

  describe('handleConvertToGif', () => {
    it('should convert video to GIF', async () => {
      const onRefresh = vi.fn();
      const { result } = renderHook(() => useIngredientActions({ onRefresh }));

      await act(async () => {
        await result.current.handlers.handleConvertToGif(mockVideoIngredient);
      });

      expect(mockVideosService.postGif).toHaveBeenCalledWith('ingredient-1');
      expect(onRefresh).toHaveBeenCalled();
    });
  });

  describe('handleVote', () => {
    it('should vote on ingredient', async () => {
      const ingredient = {
        ...mockVideoIngredient,
        hasVoted: false,
        totalVotes: 5,
      };
      const { result } = renderHook(() => useIngredientActions());

      await act(async () => {
        await result.current.handlers.handleVote(ingredient);
      });

      expect(mockIngredientsService.vote).toHaveBeenCalledWith(
        'ingredient-1',
        'vote',
      );
      expect(mockNotificationsService.success).toHaveBeenCalledWith(
        'Voted successfully',
      );
    });

    it('should unvote on ingredient', async () => {
      const ingredient = {
        ...mockVideoIngredient,
        hasVoted: true,
        totalVotes: 5,
      };
      const { result } = renderHook(() => useIngredientActions());

      await act(async () => {
        await result.current.handlers.handleVote(ingredient);
      });

      expect(mockIngredientsService.vote).toHaveBeenCalledWith(
        'ingredient-1',
        'unvote',
      );
    });
  });

  describe('handleGenerateCaptions', () => {
    it('should generate captions for video', async () => {
      const onRefresh = vi.fn();
      const { result } = renderHook(() => useIngredientActions({ onRefresh }));

      await act(async () => {
        await result.current.handlers.handleGenerateCaptions(
          mockVideoIngredient,
        );
      });

      expect(mockVideosService.postCaptions).toHaveBeenCalledWith(
        'ingredient-1',
        'captions',
      );
      expect(onRefresh).toHaveBeenCalled();
    });
  });

  describe('handleSetAsLogo', () => {
    it('should set image as logo', async () => {
      const onRefresh = vi.fn();
      const { result } = renderHook(() => useIngredientActions({ onRefresh }));

      await act(async () => {
        await result.current.handlers.handleSetAsLogo(mockImageIngredient);
      });

      expect(mockAssetsService.postFromIngredient).toHaveBeenCalledWith({
        category: AssetCategory.LOGO,
        ingredientId: 'ingredient-2',
        parent: 'brand-1',
      });
      expect(onRefresh).toHaveBeenCalled();
    });

    it('should show error if no brand selected', async () => {
      (useBrand as ReturnType<typeof vi.fn>).mockReturnValue({
        brandId: null,
      });
      const { result } = renderHook(() => useIngredientActions());

      await act(async () => {
        await result.current.handlers.handleSetAsLogo(mockImageIngredient);
      });

      expect(mockNotificationsService.error).toHaveBeenCalledWith(
        'No brand selected',
      );
    });
  });

  describe('handleSetAsBanner', () => {
    it('should set image as banner', async () => {
      const onRefresh = vi.fn();
      const { result } = renderHook(() => useIngredientActions({ onRefresh }));

      await act(async () => {
        await result.current.handlers.handleSetAsBanner(mockImageIngredient);
      });

      expect(mockAssetsService.postFromIngredient).toHaveBeenCalledWith({
        category: AssetCategory.BANNER,
        ingredientId: 'ingredient-2',
        parent: 'brand-1',
      });
      expect(onRefresh).toHaveBeenCalled();
    });
  });

  describe('handleDelete', () => {
    it('should call onDeleteIngredient callback', async () => {
      const onDeleteIngredient = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() =>
        useIngredientActions({ onDeleteIngredient }),
      );

      await act(async () => {
        await result.current.handlers.handleDelete(mockVideoIngredient);
      });

      expect(onDeleteIngredient).toHaveBeenCalledWith(mockVideoIngredient);
    });

    it('should show success message if no callback provided', async () => {
      const { result } = renderHook(() => useIngredientActions());

      await act(async () => {
        await result.current.handlers.handleDelete(mockVideoIngredient);
      });

      expect(mockIngredientsService.delete).toHaveBeenCalledWith(
        'ingredient-1',
      );
      expect(mockNotificationsService.success).toHaveBeenCalledWith(
        'Ingredient deleted successfully',
      );
    });
  });

  describe('showActions state', () => {
    it('should update showActions state', () => {
      const { result } = renderHook(() => useIngredientActions());

      act(() => {
        result.current.setShowActions(true);
      });

      expect(result.current.showActions).toBe(true);
    });
  });
});
