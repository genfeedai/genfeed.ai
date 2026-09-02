import type { IIngredient, IPost } from '@genfeedai/contracts/interfaces';
import { usePostDetailMedia } from '@hooks/pages/use-post-detail/use-post-detail-media';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockOpenGallery, mockOpenGenerateIllustration } = vi.hoisted(() => ({
  mockOpenGallery: vi.fn(),
  mockOpenGenerateIllustration: vi.fn(),
}));

vi.mock(
  '@genfeedai/contexts/providers/global-modals/global-modals.provider',
  () => ({
    useGalleryModal: vi.fn(() => ({
      openGallery: mockOpenGallery,
    })),
    useGenerateIllustrationModal: vi.fn(() => ({
      openGenerateIllustration: mockOpenGenerateIllustration,
    })),
  }),
);

vi.mock('@genfeedai/services/content/posts.service', () => ({
  PostsService: {
    getInstance: vi.fn(),
  },
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('@genfeedai/utils/carousel-validation', () => ({
  getCarouselLimits: vi.fn(() => ({ max: 10, min: 1 })),
}));

vi.mock('@hooks/pages/use-post-detail/use-post-detail-state', () => ({
  getFormatForPlatform: vi.fn(() => 'landscape'),
}));

interface GalleryOptions {
  category: string;
  maxSelectableItems: number;
  onSelect: (selected: Array<{ id: string }> | null) => Promise<void>;
  selectedId?: string;
  selectedReferences?: string[];
}

interface IllustrationOptions {
  initialPrompt: string;
  onConfirm: (imageId: string) => Promise<void>;
  postId: string;
}

const PARENT_POST = {
  credential: { id: 'cred-1', platform: 'INSTAGRAM' },
  id: 'post-1',
} as unknown as IPost;

const CHILD_POST = {
  credential: { id: 'cred-1', platform: 'INSTAGRAM' },
  id: 'child-1',
} as unknown as IPost;

function ingredient(id: string): IIngredient {
  return { category: 'image', id } as unknown as IIngredient;
}

describe('usePostDetailMedia', () => {
  const mockServicePatch = vi.fn();
  const mockGetPostsService = vi.fn();
  const mockNotificationsService = {
    error: vi.fn(),
    success: vi.fn(),
  };
  const mockFetchPost = vi.fn();
  const mockHandleUpdateChild = vi.fn();
  const mockSetPost = vi.fn();
  const mockSetSelectedIngredients = vi.fn();
  const mockSetIsSavingIngredients = vi.fn();

  const baseProps = {
    fetchPost: mockFetchPost,
    getPostsService: mockGetPostsService,
    handleUpdateChild: mockHandleUpdateChild,
    notificationsService: mockNotificationsService as never,
    post: PARENT_POST,
    setIsSavingIngredients: mockSetIsSavingIngredients,
    setPost: mockSetPost,
    setSelectedIngredients: mockSetSelectedIngredients,
    sortedChildren: [CHILD_POST],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockServicePatch.mockResolvedValue({});
    mockGetPostsService.mockResolvedValue({ patch: mockServicePatch });
    mockFetchPost.mockResolvedValue(undefined);
  });

  it('returns required handler functions', () => {
    const { result } = renderHook(() => usePostDetailMedia(baseProps));
    expect(result.current).toHaveProperty('handleSelectMedia');
    expect(result.current).toHaveProperty('handleGenerateIllustration');
    expect(typeof result.current.handleSelectMedia).toBe('function');
    expect(typeof result.current.handleGenerateIllustration).toBe('function');
  });

  it('opens the gallery with carousel limits and current selection', () => {
    const { result } = renderHook(() => usePostDetailMedia(baseProps));

    act(() => {
      result.current.handleSelectMedia('post-1', [ingredient('ing-1')]);
    });

    const options = mockOpenGallery.mock.calls[0][0] as GalleryOptions;
    expect(options.category).toBe('image');
    expect(options.maxSelectableItems).toBe(10);
    expect(options.selectedId).toBe('ing-1');
    expect(options.selectedReferences).toBeUndefined();
  });

  it('passes multiple selections as references', () => {
    const { result } = renderHook(() => usePostDetailMedia(baseProps));

    act(() => {
      result.current.handleSelectMedia('post-1', [
        ingredient('ing-1'),
        ingredient('ing-2'),
      ]);
    });

    const options = mockOpenGallery.mock.calls[0][0] as GalleryOptions;
    expect(options.selectedId).toBeUndefined();
    expect(options.selectedReferences).toEqual(['ing-1', 'ing-2']);
  });

  it('does nothing for an unknown target post', () => {
    const { result } = renderHook(() => usePostDetailMedia(baseProps));

    act(() => {
      result.current.handleSelectMedia('missing-post', []);
    });

    expect(mockOpenGallery).not.toHaveBeenCalled();
  });

  it('saves deduplicated selections to the parent post', async () => {
    const { result } = renderHook(() => usePostDetailMedia(baseProps));

    act(() => {
      result.current.handleSelectMedia('post-1', []);
    });

    const options = mockOpenGallery.mock.calls[0][0] as GalleryOptions;

    await act(async () => {
      await options.onSelect([
        { id: 'ing-1' },
        { id: 'ing-1' },
        { id: 'ing-2' },
      ]);
    });

    expect(mockServicePatch).toHaveBeenCalledWith('post-1', {
      ingredients: ['ing-1', 'ing-2'],
    });
    expect(mockSetSelectedIngredients).toHaveBeenCalledWith([
      { id: 'ing-1' },
      { id: 'ing-2' },
    ]);
    expect(mockSetPost).toHaveBeenCalled();
    expect(mockSetIsSavingIngredients).toHaveBeenNthCalledWith(1, true);
    expect(mockSetIsSavingIngredients).toHaveBeenLastCalledWith(false);
  });

  it('routes child selections through handleUpdateChild', async () => {
    const { result } = renderHook(() => usePostDetailMedia(baseProps));

    act(() => {
      result.current.handleSelectMedia('child-1', []);
    });

    const options = mockOpenGallery.mock.calls[0][0] as GalleryOptions;

    await act(async () => {
      await options.onSelect([{ id: 'ing-1' }]);
    });

    expect(mockServicePatch).toHaveBeenCalledWith('child-1', {
      ingredients: ['ing-1'],
    });
    expect(mockHandleUpdateChild).toHaveBeenCalledWith('child-1', {
      ingredients: [{ id: 'ing-1' }],
    });
    expect(mockSetPost).not.toHaveBeenCalled();
  });

  it('clears ingredients when the selection is emptied', async () => {
    const { result } = renderHook(() => usePostDetailMedia(baseProps));

    act(() => {
      result.current.handleSelectMedia('post-1', [ingredient('ing-1')]);
    });

    const options = mockOpenGallery.mock.calls[0][0] as GalleryOptions;

    await act(async () => {
      await options.onSelect([]);
    });

    expect(mockServicePatch).toHaveBeenCalledWith('post-1', {
      ingredients: [],
    });
    expect(mockSetSelectedIngredients).toHaveBeenCalledWith([]);
  });

  it('clears child ingredients when the selection is emptied', async () => {
    const { result } = renderHook(() => usePostDetailMedia(baseProps));

    act(() => {
      result.current.handleSelectMedia('child-1', [ingredient('ing-1')]);
    });

    const options = mockOpenGallery.mock.calls[0][0] as GalleryOptions;

    await act(async () => {
      await options.onSelect([]);
    });

    expect(mockHandleUpdateChild).toHaveBeenCalledWith('child-1', {
      ingredients: [],
    });
  });

  it('attaches a generated illustration and refreshes the post', async () => {
    const { result } = renderHook(() => usePostDetailMedia(baseProps));

    act(() => {
      result.current.handleGenerateIllustration('post-1', 'draw a fox');
    });

    const options = mockOpenGenerateIllustration.mock
      .calls[0][0] as IllustrationOptions;
    expect(options.initialPrompt).toBe('draw a fox');
    expect(options.postId).toBe('post-1');

    await act(async () => {
      await options.onConfirm('image-1');
    });

    expect(mockServicePatch).toHaveBeenCalledWith('post-1', {
      ingredients: ['image-1'],
    });
    expect(mockNotificationsService.success).toHaveBeenCalledWith(
      'Illustration generated and attached!',
    );
    expect(mockFetchPost).toHaveBeenCalledWith(true);
  });

  it('notifies when attaching the illustration fails', async () => {
    mockServicePatch.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => usePostDetailMedia(baseProps));

    act(() => {
      result.current.handleGenerateIllustration('post-1', 'draw a fox');
    });

    const options = mockOpenGenerateIllustration.mock
      .calls[0][0] as IllustrationOptions;

    await act(async () => {
      await options.onConfirm('image-1');
    });

    expect(mockNotificationsService.error).toHaveBeenCalledWith(
      'Failed to attach illustration to post',
    );
    expect(mockSetIsSavingIngredients).toHaveBeenLastCalledWith(false);
  });
});
