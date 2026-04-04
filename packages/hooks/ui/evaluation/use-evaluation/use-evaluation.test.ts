import { IngredientCategory, Status } from '@genfeedai/enums';
import { useEvaluation } from '@hooks/ui/evaluation/use-evaluation/use-evaluation';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock functions must be defined inside the factory function to avoid hoisting issues
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(),
}));

vi.mock('@hooks/utils/use-socket-manager/use-socket-manager', () => ({
  useSocketSubscription: vi.fn(),
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

// Import after mocking
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { NotificationsService } from '@services/core/notifications.service';

// Mock references
const mockGetImageEvaluations = vi.fn();
const mockGetVideoEvaluations = vi.fn();
const mockGetArticleEvaluations = vi.fn();
const mockGetPostEvaluations = vi.fn();
const mockEvaluateImage = vi.fn();
const mockEvaluateVideo = vi.fn();
const mockEvaluateArticle = vi.fn();
const mockEvaluatePost = vi.fn();
const mockSuccess = vi.fn();
const mockError = vi.fn();

describe('useEvaluation', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup useAuthedService mock
    (useAuthedService as ReturnType<typeof vi.fn>).mockReturnValue(
      vi.fn().mockResolvedValue({
        evaluateArticle: mockEvaluateArticle,
        evaluateImage: mockEvaluateImage,
        evaluatePost: mockEvaluatePost,
        evaluateVideo: mockEvaluateVideo,
        getArticleEvaluations: mockGetArticleEvaluations,
        getImageEvaluations: mockGetImageEvaluations,
        getPostEvaluations: mockGetPostEvaluations,
        getVideoEvaluations: mockGetVideoEvaluations,
      }),
    );

    // Setup NotificationsService mock
    (
      NotificationsService.getInstance as ReturnType<typeof vi.fn>
    ).mockReturnValue({
      error: mockError,
      success: mockSuccess,
    });

    mockGetImageEvaluations.mockResolvedValue([]);
    mockGetVideoEvaluations.mockResolvedValue([]);
    mockGetArticleEvaluations.mockResolvedValue([]);
    mockGetPostEvaluations.mockResolvedValue([]);
  });

  describe('Initial State', () => {
    it('returns initial state with null evaluation', () => {
      const { result } = renderHook(() =>
        useEvaluation({
          autoFetch: false,
          contentId: 'test-id',
          contentType: IngredientCategory.IMAGE,
        }),
      );

      expect(result.current.evaluation).toBeNull();
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isEvaluating).toBe(false);
    });

    it('provides evaluate and refetch functions', () => {
      const { result } = renderHook(() =>
        useEvaluation({
          autoFetch: false,
          contentId: 'test-id',
          contentType: IngredientCategory.IMAGE,
        }),
      );

      expect(typeof result.current.evaluate).toBe('function');
      expect(typeof result.current.refetch).toBe('function');
    });
  });

  describe('Auto Fetch', () => {
    it('fetches evaluation on mount when autoFetch is true', async () => {
      const mockEvaluation = { id: 'eval-1', score: 85 };
      mockGetImageEvaluations.mockResolvedValue([mockEvaluation]);

      const { result } = renderHook(() =>
        useEvaluation({
          autoFetch: true,
          contentId: 'test-id',
          contentType: IngredientCategory.IMAGE,
        }),
      );

      await waitFor(() => {
        expect(mockGetImageEvaluations).toHaveBeenCalledWith('test-id');
      });

      await waitFor(() => {
        expect(result.current.evaluation).toEqual(mockEvaluation);
      });
    });

    it('does not fetch when autoFetch is false', async () => {
      renderHook(() =>
        useEvaluation({
          autoFetch: false,
          contentId: 'test-id',
          contentType: IngredientCategory.IMAGE,
        }),
      );

      // Wait a bit to ensure no fetch is triggered
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockGetImageEvaluations).not.toHaveBeenCalled();
    });

    it('does not fetch when contentId is empty', async () => {
      renderHook(() =>
        useEvaluation({
          autoFetch: true,
          contentId: '',
          contentType: IngredientCategory.IMAGE,
        }),
      );

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockGetImageEvaluations).not.toHaveBeenCalled();
    });
  });

  describe('Fetch Evaluation', () => {
    it('fetches image evaluations for IMAGE content type', async () => {
      const mockEvaluation = { id: 'eval-1', score: 90 };
      mockGetImageEvaluations.mockResolvedValue([mockEvaluation]);

      const { result } = renderHook(() =>
        useEvaluation({
          autoFetch: false,
          contentId: 'img-123',
          contentType: IngredientCategory.IMAGE,
        }),
      );

      await act(async () => {
        await result.current.refetch();
      });

      expect(mockGetImageEvaluations).toHaveBeenCalledWith('img-123');
      expect(result.current.evaluation).toEqual(mockEvaluation);
    });

    it('fetches video evaluations for VIDEO content type', async () => {
      const mockEvaluation = { id: 'eval-2', score: 75 };
      mockGetVideoEvaluations.mockResolvedValue([mockEvaluation]);

      const { result } = renderHook(() =>
        useEvaluation({
          autoFetch: false,
          contentId: 'vid-456',
          contentType: IngredientCategory.VIDEO,
        }),
      );

      await act(async () => {
        await result.current.refetch();
      });

      expect(mockGetVideoEvaluations).toHaveBeenCalledWith('vid-456');
      expect(result.current.evaluation).toEqual(mockEvaluation);
    });

    it('fetches article evaluations for article content type', async () => {
      const mockEvaluation = { id: 'eval-3', score: 80 };
      mockGetArticleEvaluations.mockResolvedValue([mockEvaluation]);

      const { result } = renderHook(() =>
        useEvaluation({
          autoFetch: false,
          contentId: 'art-789',
          contentType: 'article',
        }),
      );

      await act(async () => {
        await result.current.refetch();
      });

      expect(mockGetArticleEvaluations).toHaveBeenCalledWith('art-789');
      expect(result.current.evaluation).toEqual(mockEvaluation);
    });

    it('fetches post evaluations for post content type', async () => {
      const mockEvaluation = { id: 'eval-4', score: 95 };
      mockGetPostEvaluations.mockResolvedValue([mockEvaluation]);

      const { result } = renderHook(() =>
        useEvaluation({
          autoFetch: false,
          contentId: 'post-123',
          contentType: 'post',
        }),
      );

      await act(async () => {
        await result.current.refetch();
      });

      expect(mockGetPostEvaluations).toHaveBeenCalledWith('post-123');
      expect(result.current.evaluation).toEqual(mockEvaluation);
    });

    it('returns most recent evaluation from array', async () => {
      const evaluations = [
        { id: 'eval-1', score: 90 },
        { id: 'eval-2', score: 85 },
      ];
      mockGetImageEvaluations.mockResolvedValue(evaluations);

      const { result } = renderHook(() =>
        useEvaluation({
          autoFetch: false,
          contentId: 'test-id',
          contentType: IngredientCategory.IMAGE,
        }),
      );

      await act(async () => {
        await result.current.refetch();
      });

      expect(result.current.evaluation).toEqual(evaluations[0]);
    });

    it('sets evaluation to null when no evaluations found', async () => {
      mockGetImageEvaluations.mockResolvedValue([]);

      const { result } = renderHook(() =>
        useEvaluation({
          autoFetch: false,
          contentId: 'test-id',
          contentType: IngredientCategory.IMAGE,
        }),
      );

      await act(async () => {
        await result.current.refetch();
      });

      expect(result.current.evaluation).toBeNull();
    });

    it('manages loading state during fetch', async () => {
      let resolvePromise: (value: any) => void;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      mockGetImageEvaluations.mockReturnValue(promise);

      const { result } = renderHook(() =>
        useEvaluation({
          autoFetch: false,
          contentId: 'test-id',
          contentType: IngredientCategory.IMAGE,
        }),
      );

      expect(result.current.isLoading).toBe(false);

      act(() => {
        result.current.refetch();
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(true);
      });

      await act(async () => {
        resolvePromise?.([]);
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('handles fetch errors gracefully', async () => {
      mockGetImageEvaluations.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() =>
        useEvaluation({
          autoFetch: false,
          contentId: 'test-id',
          contentType: IngredientCategory.IMAGE,
        }),
      );

      await act(async () => {
        await result.current.refetch();
      });

      // Should not throw and loading should be false
      expect(result.current.isLoading).toBe(false);
      expect(result.current.evaluation).toBeNull();
    });
  });

  describe('Evaluate', () => {
    it('evaluates image content', async () => {
      const mockResult = {
        id: 'new-eval',
        score: 88,
        status: Status.COMPLETED,
      };
      mockEvaluateImage.mockResolvedValue(mockResult);

      const { result } = renderHook(() =>
        useEvaluation({
          autoFetch: false,
          contentId: 'img-123',
          contentType: IngredientCategory.IMAGE,
        }),
      );

      await act(async () => {
        await result.current.evaluate();
      });

      expect(mockEvaluateImage).toHaveBeenCalledWith('img-123');
      expect(result.current.evaluation).toEqual(mockResult);
      expect(mockSuccess).toHaveBeenCalledWith(
        'Content evaluated successfully',
      );
    });

    it('evaluates video content', async () => {
      const mockResult = {
        id: 'new-eval',
        score: 92,
        status: Status.COMPLETED,
      };
      mockEvaluateVideo.mockResolvedValue(mockResult);

      const { result } = renderHook(() =>
        useEvaluation({
          autoFetch: false,
          contentId: 'vid-456',
          contentType: IngredientCategory.VIDEO,
        }),
      );

      await act(async () => {
        await result.current.evaluate();
      });

      expect(mockEvaluateVideo).toHaveBeenCalledWith('vid-456');
      expect(result.current.evaluation).toEqual(mockResult);
    });

    it('evaluates article content', async () => {
      const mockResult = {
        id: 'new-eval',
        score: 78,
        status: Status.COMPLETED,
      };
      mockEvaluateArticle.mockResolvedValue(mockResult);

      const { result } = renderHook(() =>
        useEvaluation({
          autoFetch: false,
          contentId: 'art-789',
          contentType: 'article',
        }),
      );

      await act(async () => {
        await result.current.evaluate();
      });

      expect(mockEvaluateArticle).toHaveBeenCalledWith('art-789');
      expect(result.current.evaluation).toEqual(mockResult);
    });

    it('evaluates post content', async () => {
      const mockResult = {
        id: 'new-eval',
        score: 85,
        status: Status.COMPLETED,
      };
      mockEvaluatePost.mockResolvedValue(mockResult);

      const { result } = renderHook(() =>
        useEvaluation({
          autoFetch: false,
          contentId: 'post-123',
          contentType: 'post',
        }),
      );

      await act(async () => {
        await result.current.evaluate();
      });

      expect(mockEvaluatePost).toHaveBeenCalledWith('post-123');
      expect(result.current.evaluation).toEqual(mockResult);
    });

    it('manages isEvaluating state during evaluation', async () => {
      let resolvePromise: (value: any) => void;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      mockEvaluateImage.mockReturnValue(promise);

      const { result } = renderHook(() =>
        useEvaluation({
          autoFetch: false,
          contentId: 'test-id',
          contentType: IngredientCategory.IMAGE,
        }),
      );

      expect(result.current.isEvaluating).toBe(false);

      act(() => {
        result.current.evaluate();
      });

      await waitFor(() => {
        expect(result.current.isEvaluating).toBe(true);
      });

      await act(async () => {
        resolvePromise?.({ id: 'eval', status: Status.COMPLETED });
      });

      await waitFor(() => {
        expect(result.current.isEvaluating).toBe(false);
      });
    });

    it('handles insufficient credits error', async () => {
      const error = {
        response: { status: 403 },
      };
      mockEvaluateImage.mockRejectedValue(error);

      const { result } = renderHook(() =>
        useEvaluation({
          autoFetch: false,
          contentId: 'test-id',
          contentType: IngredientCategory.IMAGE,
        }),
      );

      try {
        await act(async () => {
          await result.current.evaluate();
        });
      } catch {
        // Expected to throw
      }

      await waitFor(() => {
        expect(mockError).toHaveBeenCalledWith(
          'Insufficient credits for evaluation',
        );
      });
    });

    it('handles generic evaluation error', async () => {
      const error = new Error('Server error');
      mockEvaluateImage.mockRejectedValue(error);

      const { result } = renderHook(() =>
        useEvaluation({
          autoFetch: false,
          contentId: 'test-id',
          contentType: IngredientCategory.IMAGE,
        }),
      );

      try {
        await act(async () => {
          await result.current.evaluate();
        });
      } catch {
        // Expected to throw
      }

      await waitFor(() => {
        expect(mockError).toHaveBeenCalledWith('Failed to evaluate content');
      });
    });

    it('does not evaluate when contentId is empty', async () => {
      const { result } = renderHook(() =>
        useEvaluation({
          autoFetch: false,
          contentId: '',
          contentType: IngredientCategory.IMAGE,
        }),
      );

      await act(async () => {
        await result.current.evaluate();
      });

      expect(mockEvaluateImage).not.toHaveBeenCalled();
    });
  });

  describe('Content Type Handling', () => {
    it('handles unsupported content type during fetch', async () => {
      const { result } = renderHook(() =>
        useEvaluation({
          autoFetch: false,
          contentId: 'test-id',
          contentType: 'unknown' as any,
        }),
      );

      await act(async () => {
        await result.current.refetch();
      });

      // Should set empty evaluations for unknown type
      expect(result.current.evaluation).toBeNull();
    });
  });
});
