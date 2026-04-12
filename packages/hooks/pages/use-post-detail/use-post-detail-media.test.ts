import { usePostDetailMedia } from '@hooks/pages/use-post-detail/use-post-detail-media';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock(
  '@genfeedai/contexts/providers/global-modals/global-modals.provider',
  () => ({
    useGalleryModal: vi.fn(() => ({
      openGallery: vi.fn(),
    })),
    useGenerateIllustrationModal: vi.fn(() => ({
      openGenerateIllustration: vi.fn(),
    })),
  }),
);

vi.mock('@genfeedai/services/content/posts.service', () => ({
  PostsService: {
    getInstance: vi.fn(),
  },
}));

vi.mock('@genfeedai/utils/carousel-validation', () => ({
  getCarouselLimits: vi.fn(() => ({ max: 10, min: 1 })),
}));

vi.mock('@hooks/pages/use-post-detail/use-post-detail-state', () => ({
  getFormatForPlatform: vi.fn(() => 'landscape'),
}));

describe('usePostDetailMedia', () => {
  const mockGetPostsService = vi.fn().mockResolvedValue({
    patch: vi.fn().mockResolvedValue({}),
  });
  const mockNotificationsService = {
    error: vi.fn(),
    success: vi.fn(),
  };

  const baseProps = {
    fetchPost: vi.fn().mockResolvedValue(undefined),
    getPostsService: mockGetPostsService,
    handleUpdateChild: vi.fn(),
    notificationsService: mockNotificationsService as never,
    post: null,
    setIsSavingIngredients: vi.fn(),
    setPost: vi.fn(),
    setSelectedIngredients: vi.fn(),
    sortedChildren: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns required handler functions', () => {
    const { result } = renderHook(() => usePostDetailMedia(baseProps));
    expect(result.current).toHaveProperty('handleSelectMedia');
    expect(result.current).toHaveProperty('handleGenerateIllustration');
  });

  it('all returned values are functions', () => {
    const { result } = renderHook(() => usePostDetailMedia(baseProps));
    expect(typeof result.current.handleSelectMedia).toBe('function');
    expect(typeof result.current.handleGenerateIllustration).toBe('function');
  });
});
