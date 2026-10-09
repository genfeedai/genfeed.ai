import {
  IngredientFormat,
  PageScope,
  Platform,
  PostCategory,
  PostStatus,
  TargetExecutionState,
} from '@genfeedai/contracts';
import {
  FIRST_COMMENT_PLACEHOLDER,
  GROK_FEEDBACK_QUESTIONS,
  PLATFORM_FORMAT_MAP,
  usePostDetailState,
} from '@hooks/pages/use-post-detail/use-post-detail-state';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFindOne, mockGetPostsService } = vi.hoisted(() => ({
  mockFindOne: vi.fn(),
  mockGetPostsService: vi.fn(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => mockGetPostsService),
}));

vi.mock('@genfeedai/services/content/posts.service', () => ({
  PostsService: {
    getInstance: vi.fn(() => ({
      findAll: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockResolvedValue(null),
    })),
  },
}));

vi.mock('@genfeedai/services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(() => ({
      error: vi.fn(),
      success: vi.fn(),
    })),
  },
}));

vi.mock('@genfeedai/utils/carousel-validation', () => ({
  validateCarouselCount: vi.fn(() => true),
}));

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/manager/posts/post-1'),
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn() })),
}));

vi.mock('lucide-react', () => ({
  Eye: {},
  Heart: {},
  MessageSquare: {},
  TrendingUp: {},
  Zap: {},
}));

describe('constants', () => {
  it('GROK_FEEDBACK_QUESTIONS is an array', () => {
    expect(Array.isArray(GROK_FEEDBACK_QUESTIONS)).toBe(true);
    expect(GROK_FEEDBACK_QUESTIONS.length).toBeGreaterThan(0);
    expect(GROK_FEEDBACK_QUESTIONS[0]).toContain('@grok');
  });

  it('FIRST_COMMENT_PLACEHOLDER is a string', () => {
    expect(typeof FIRST_COMMENT_PLACEHOLDER).toBe('string');
    expect(FIRST_COMMENT_PLACEHOLDER.length).toBeGreaterThan(0);
  });

  it('PLATFORM_FORMAT_MAP maps platforms to ingredient formats', () => {
    expect(PLATFORM_FORMAT_MAP[Platform.TWITTER]).toBe(
      IngredientFormat.LANDSCAPE,
    );
    expect(PLATFORM_FORMAT_MAP[Platform.INSTAGRAM]).toBe(
      IngredientFormat.SQUARE,
    );
    expect(PLATFORM_FORMAT_MAP[Platform.PINTEREST]).toBe(
      IngredientFormat.PORTRAIT,
    );
  });
});

describe('usePostDetailState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindOne.mockResolvedValue(null);
    mockGetPostsService.mockResolvedValue({
      findAll: vi.fn().mockResolvedValue([]),
      findOne: mockFindOne,
    });
  });

  async function renderWithEngagementRate(
    avgEngagementRate: number | undefined,
  ) {
    mockFindOne.mockResolvedValue({
      avgEngagementRate,
      category: PostCategory.VIDEO,
      children: [],
      id: 'post-1',
      ingredients: [],
      label: 'Product workflow walkthrough',
      publicationDate: '2026-10-01T12:00:00.000Z',
      status: PostStatus.PUBLIC,
      targetExecutionState: TargetExecutionState.PUBLISHED,
      totalViews: 2100,
    });

    const hook = renderHook(() =>
      usePostDetailState({ postId: 'post-1', scope: PageScope.PUBLISHING }),
    );

    await waitFor(() => {
      expect(hook.result.current.isLoading).toBe(false);
      expect(hook.result.current.post?.id).toBe('post-1');
    });
    expect(mockFindOne).toHaveBeenCalledWith('post-1');

    return hook;
  }

  it('displays the API engagement percentage with one decimal', async () => {
    const { result } = await renderWithEngagementRate(13.005632316300439);

    expect(
      result.current.analyticsStats.find((stat) => stat.label === 'Engagement'),
    ).toMatchObject({ value: '13.0%' });
  });

  it('displays a zero API engagement percentage', async () => {
    const { result } = await renderWithEngagementRate(0);

    expect(
      result.current.analyticsStats.find((stat) => stat.label === 'Engagement'),
    ).toMatchObject({ value: '0.0%' });
  });

  it('omits engagement when the API percentage is absent', async () => {
    const { result } = await renderWithEngagementRate(undefined);

    expect(
      result.current.analyticsStats.some((stat) => stat.label === 'Engagement'),
    ).toBe(false);
    expect(
      result.current.analyticsStats.some((stat) => stat.label === 'Views'),
    ).toBe(true);
  });

  it('returns required state fields', () => {
    const { result } = renderHook(() =>
      usePostDetailState({ postId: 'post-1' }),
    );
    expect(result.current).toHaveProperty('post');
    expect(result.current).toHaveProperty('isLoading');
    expect(result.current).toHaveProperty('setPost');
    expect(result.current).toHaveProperty('viewMode');
    expect(result.current).toHaveProperty('setViewMode');
    expect(result.current).toHaveProperty('getPostsService');
    expect(result.current).toHaveProperty('getReleaseGroupsService');
    expect(result.current).toHaveProperty('notificationsService');
  });

  it('initializes post as null', () => {
    const { result } = renderHook(() =>
      usePostDetailState({ postId: 'post-1' }),
    );
    expect(result.current.post).toBeNull();
  });

  it('initializes isLoading as true', () => {
    const { result } = renderHook(() =>
      usePostDetailState({ postId: 'post-1' }),
    );
    expect(result.current.isLoading).toBe(true);
  });
});
