import { IngredientCategory, Status } from '@genfeedai/contracts';
import { useEvaluation } from '@hooks/ui/evaluation/use-evaluation/use-evaluation';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  renderHook as renderHookWithoutProvider,
  waitFor,
} from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const scoped = vi.hoisted(() => ({ key: 'scope-a', invalidate: vi.fn() }));
vi.mock('@hooks/ui/evaluation/use-evaluation/evaluation-read-cache', () => ({
  useEvaluationReadScopeKey: () => scoped.key,
  invalidateEvaluationVideoRead: scoped.invalidate,
}));
let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client: queryClient }, children);
const renderHook: typeof renderHookWithoutProvider = (callback, options) =>
  renderHookWithoutProvider(callback, { ...options, wrapper });

// Mock functions must be defined inside the factory function to avoid hoisting issues
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(),
}));

vi.mock('@hooks/utils/use-socket-manager/use-socket-manager', () => ({
  useSocketSubscriptions: vi.fn(),
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@genfeedai/services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(),
  },
}));

import { NotificationsService } from '@genfeedai/services/core/notifications.service';
// Import after mocking
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useSocketSubscriptions } from '@hooks/utils/use-socket-manager/use-socket-manager';

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
    queryClient = new QueryClient();
    scoped.key = 'scope-a';
    scoped.invalidate.mockResolvedValue(undefined);

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
      let resolvePromise: (value: unknown) => void;
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
        data: { status: Status.COMPLETED },
        id: 'new-eval',
        score: 88,
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
        data: { status: Status.COMPLETED },
        id: 'new-eval',
        score: 92,
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
        data: { status: Status.COMPLETED },
        id: 'new-eval',
        score: 78,
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
        data: { status: Status.COMPLETED },
        id: 'new-eval',
        score: 85,
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
      let resolvePromise: (value: unknown) => void;
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
        resolvePromise?.({
          data: { status: Status.COMPLETED },
          id: 'eval',
        });
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
          contentType: 'unknown' as Parameters<
            typeof useEvaluation
          >[0]['contentType'],
        }),
      );

      await act(async () => {
        await result.current.refetch();
      });

      // Should set empty evaluations for unknown type
      expect(result.current.evaluation).toBeNull();
    });
  });
  describe('scope-safe persisted status freshness', () => {
    it('invalidates the matching warm Trends scope after synchronous completion', async () => {
      mockEvaluateVideo.mockResolvedValue({
        id: 'saved',
        data: { status: Status.COMPLETED },
      });
      const { result } = renderHook(() =>
        useEvaluation({
          autoFetch: false,
          contentId: 'video',
          contentType: IngredientCategory.VIDEO,
        }),
      );
      await act(async () => {
        await result.current.evaluate();
      });
      expect(scoped.invalidate).toHaveBeenCalledWith(queryClient, 'scope-a');
      expect(result.current.isEvaluating).toBe(false);
    });
    it.each([Status.COMPLETED, Status.FAILED])(
      'invalidates matching websocket %s but ignores another result ID',
      async (status) => {
        mockEvaluateVideo.mockResolvedValue({
          id: 'pending',
          data: { status: Status.PROCESSING },
        });
        const { result } = renderHook(() =>
          useEvaluation({
            autoFetch: false,
            contentId: 'video',
            contentType: IngredientCategory.VIDEO,
          }),
        );
        await act(async () => {
          await result.current.evaluate();
        });
        const subscriptions = vi
          .mocked(useSocketSubscriptions)
          .mock.calls.at(-1)?.[0];
        const handler = subscriptions?.[0]?.handler;
        expect(handler).toBeDefined();
        const completed = { id: 'pending', data: { status } };
        act(() => {
          handler?.({ status, result: { ...completed, id: 'different' } });
        });
        expect(result.current.isEvaluating).toBe(true);
        expect(scoped.invalidate).toHaveBeenCalledTimes(1);
        act(() => {
          handler?.({ status, result: completed });
        });
        expect(scoped.invalidate).toHaveBeenCalledTimes(2);
        expect(result.current.evaluation).toEqual(completed);
        expect(result.current.isEvaluating).toBe(false);
      },
    );
    it('ignores an old organization response and clears transient state on scope change', async () => {
      let resolve: (value: object) => void = () => {};
      mockEvaluateVideo.mockReturnValue(
        new Promise((done) => {
          resolve = done;
        }),
      );
      const { result, rerender } = renderHook(() =>
        useEvaluation({
          autoFetch: false,
          contentId: 'video',
          contentType: IngredientCategory.VIDEO,
        }),
      );
      let pending: Promise<unknown> | undefined;
      await act(async () => {
        pending = result.current.evaluate();
        await Promise.resolve();
      });
      expect(result.current.isEvaluating).toBe(true);
      scoped.key = 'scope-b';
      rerender();
      expect(result.current.isEvaluating).toBe(false);
      await act(async () => {
        resolve({ id: 'old', data: { status: Status.COMPLETED } });
        await pending;
      });
      expect(result.current.evaluation).toBeNull();
      expect(scoped.invalidate).not.toHaveBeenCalled();
      expect(mockSuccess).not.toHaveBeenCalled();
    });
    it('ignores an old content read after another content opens', async () => {
      let resolve: (value: object[]) => void = () => {};
      mockGetVideoEvaluations.mockReturnValue(
        new Promise((done) => {
          resolve = done;
        }),
      );
      const { result, rerender } = renderHook(
        ({ id }) =>
          useEvaluation({
            autoFetch: false,
            contentId: id,
            contentType: IngredientCategory.VIDEO,
          }),
        { initialProps: { id: 'first' } },
      );
      let pending: Promise<void> | undefined;
      await act(async () => {
        pending = result.current.refetch();
        await Promise.resolve();
      });
      rerender({ id: 'second' });
      await act(async () => {
        resolve([{ id: 'old' }]);
        await pending;
      });
      expect(result.current.evaluation).toBeNull();
      expect(result.current.isLoading).toBe(false);
    });
  });
});
