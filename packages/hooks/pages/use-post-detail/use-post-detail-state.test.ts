import { IngredientFormat, Platform } from '@genfeedai/enums';
import {
  FIRST_COMMENT_PLACEHOLDER,
  GROK_FEEDBACK_QUESTIONS,
  PLATFORM_FORMAT_MAP,
  usePostDetailState,
} from '@hooks/pages/use-post-detail/use-post-detail-state';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => vi.fn()),
}));

vi.mock('@services/content/posts.service', () => ({
  PostsService: {
    getInstance: vi.fn(() => ({
      findAll: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockResolvedValue(null),
    })),
  },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(() => ({
      error: vi.fn(),
      success: vi.fn(),
    })),
  },
}));

vi.mock('@utils/carousel-validation', () => ({
  validateCarouselCount: vi.fn(() => true),
}));

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/manager/posts/post-1'),
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn() })),
}));

vi.mock('react-icons/hi2', () => ({
  HiArrowTrendingUp: {},
  HiBolt: {},
  HiChatBubbleLeftRight: {},
  HiEye: {},
  HiHeart: {},
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
