import { PageScope } from '@genfeedai/enums';
import { usePostDetailDrafts } from '@hooks/pages/use-post-detail/use-post-detail-drafts';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/services/content/posts.service', () => ({
  PostsService: {
    getInstance: vi.fn(),
  },
}));

describe('usePostDetailDrafts', () => {
  const mockGetPostsService = vi.fn().mockResolvedValue({
    patch: vi.fn().mockResolvedValue({}),
  });
  const mockHandleUpdateChild = vi.fn();
  const mockUpdateDescriptionRefs = vi.fn();
  const mockUpdateLabelRefs = vi.fn();
  const mockSetPost = vi.fn();

  const baseProps = {
    getPostsService: mockGetPostsService,
    handleUpdateChild: mockHandleUpdateChild,
    post: null,
    postId: 'post-1',
    scope: PageScope.BRAND,
    setPost: mockSetPost,
    updateDescriptionRefs: mockUpdateDescriptionRefs,
    updateLabelRefs: mockUpdateLabelRefs,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns required fields', () => {
    const { result } = renderHook(() => usePostDetailDrafts(baseProps));
    expect(result.current).toHaveProperty('labelDraft');
    expect(result.current).toHaveProperty('setLabelDraft');
    expect(result.current).toHaveProperty('descriptionDraft');
    expect(result.current).toHaveProperty('setDescriptionDraft');
    expect(result.current).toHaveProperty('childDescriptions');
    expect(result.current).toHaveProperty('scheduleDraft');
    expect(result.current).toHaveProperty('selectedIngredients');
    expect(result.current).toHaveProperty('isContentDirty');
    expect(result.current).toHaveProperty('isScheduleDirty');
    expect(result.current).toHaveProperty('performAutoSaveForPost');
  });

  it('initializes with empty draft values', () => {
    const { result } = renderHook(() => usePostDetailDrafts(baseProps));
    expect(result.current.labelDraft).toBe('');
    expect(result.current.descriptionDraft).toBe('');
    expect(result.current.scheduleDraft).toBe('');
    expect(result.current.selectedIngredients).toEqual([]);
  });

  it('initializes dirty flags as false', () => {
    const { result } = renderHook(() => usePostDetailDrafts(baseProps));
    expect(result.current.isContentDirty).toBe(false);
    expect(result.current.isScheduleDirty).toBe(false);
    expect(result.current.isDescriptionDirty).toBe(false);
    expect(result.current.isLabelDirty).toBe(false);
  });

  it('setLabelDraft updates the label draft', () => {
    const { result } = renderHook(() => usePostDetailDrafts(baseProps));
    act(() => {
      result.current.setLabelDraft('New Label');
    });
    expect(result.current.labelDraft).toBe('New Label');
  });

  it('setDescriptionDraft updates the description draft', () => {
    const { result } = renderHook(() => usePostDetailDrafts(baseProps));
    act(() => {
      result.current.setDescriptionDraft('New description');
    });
    expect(result.current.descriptionDraft).toBe('New description');
  });

  it('setChildDescription updates child descriptions map', () => {
    const { result } = renderHook(() => usePostDetailDrafts(baseProps));
    act(() => {
      result.current.setChildDescription('child-1', 'Child desc');
    });
    expect(result.current.childDescriptions.get('child-1')).toBe('Child desc');
  });

  describe('with a loaded post', () => {
    const loadedPost = {
      children: [
        { description: 'Child one', id: 'child-1', label: 'C1' },
        { description: 'Child two', id: 'child-2', label: 'C2' },
      ],
      description: 'Parent description',
      id: 'post-1',
      ingredients: [{ id: 'ing-1' }],
      label: 'Parent label',
      scheduledDate: '2025-06-01T10:00:00.000Z',
    } as never;

    function renderLoaded(
      overrides: Partial<typeof baseProps> = {},
    ): ReturnType<
      typeof renderHook<ReturnType<typeof usePostDetailDrafts>, void>
    > {
      return renderHook(() =>
        usePostDetailDrafts({ ...baseProps, post: loadedPost, ...overrides }),
      );
    }

    it('initializes drafts from the post', () => {
      const { result } = renderLoaded();

      expect(result.current.descriptionDraft).toBe('Parent description');
      expect(result.current.labelDraft).toBe('Parent label');
      expect(result.current.scheduleDraft).toBe('2025-06-01T10:00:00.000Z');
      expect(result.current.childDescriptions.get('child-1')).toBe('Child one');
      expect(result.current.childDescriptions.get('child-2')).toBe('Child two');
      expect(result.current.selectedIngredients).toEqual([{ id: 'ing-1' }]);
      expect(result.current.isContentDirty).toBe(false);
      expect(result.current.isScheduleDirty).toBe(false);
    });

    it('flags dirty description, label, and schedule', () => {
      const { result } = renderLoaded();

      act(() => {
        result.current.setDescriptionDraft('Edited description');
      });
      expect(result.current.isDescriptionDirty).toBe(true);
      expect(result.current.isContentDirty).toBe(true);

      act(() => {
        result.current.setLabelDraft('Edited label');
      });
      expect(result.current.isLabelDirty).toBe(true);

      act(() => {
        result.current.setScheduleDraft('2025-07-01T10:00:00.000Z');
      });
      expect(result.current.isScheduleDirty).toBe(true);
    });

    it('auto-saves the parent post after editing', async () => {
      const patch = vi.fn().mockResolvedValue({
        description: 'Edited description',
        id: 'post-1',
        label: 'Parent label',
      });
      mockGetPostsService.mockResolvedValue({ patch });

      const { result } = renderLoaded();

      await act(async () => {
        result.current.autoSaveRefs.currentDescriptions.current.set(
          'post-1',
          'Edited description',
        );
        await result.current.performAutoSaveForPost('post-1');
      });

      expect(patch).toHaveBeenCalledWith('post-1', {
        description: 'Edited description',
      });
      expect(mockSetPost).toHaveBeenCalled();
      expect(mockUpdateDescriptionRefs).toHaveBeenCalledWith(
        'post-1',
        'Edited description',
      );
    });

    it('auto-saves a child post through handleUpdateChild', async () => {
      const patch = vi.fn().mockResolvedValue({
        description: 'Edited child',
        id: 'child-1',
        label: 'C1',
      });
      mockGetPostsService.mockResolvedValue({ patch });

      const { result } = renderLoaded();

      await act(async () => {
        result.current.autoSaveRefs.currentDescriptions.current.set(
          'child-1',
          'Edited child',
        );
        await result.current.performAutoSaveForPost('child-1');
      });

      expect(patch).toHaveBeenCalledWith('child-1', {
        description: 'Edited child',
      });
      expect(mockHandleUpdateChild).toHaveBeenCalledWith('child-1', {
        description: 'Edited child',
        label: 'C1',
      });
      expect(result.current.childDescriptions.get('child-1')).toBe(
        'Edited child',
      );
    });

    it('skips auto-save when nothing changed', async () => {
      const patch = vi.fn();
      mockGetPostsService.mockResolvedValue({ patch });

      const { result } = renderLoaded();

      await act(async () => {
        await result.current.performAutoSaveForPost('post-1');
      });

      expect(patch).not.toHaveBeenCalled();
    });

    it('swallows auto-save failures', async () => {
      const patch = vi.fn().mockRejectedValue(new Error('boom'));
      mockGetPostsService.mockResolvedValue({ patch });

      const { result } = renderLoaded();

      await act(async () => {
        result.current.autoSaveRefs.currentDescriptions.current.set(
          'post-1',
          'Edited description',
        );
        await expect(
          result.current.performAutoSaveForPost('post-1'),
        ).resolves.toBeUndefined();
      });
    });

    it('debounces auto-save in publisher scope', async () => {
      vi.useFakeTimers();
      try {
        const patch = vi.fn().mockResolvedValue({
          description: 'Edited description',
          id: 'post-1',
          label: 'Parent label',
        });
        mockGetPostsService.mockResolvedValue({ patch });

        const { result } = renderHook(() =>
          usePostDetailDrafts({
            ...baseProps,
            post: loadedPost,
            scope: PageScope.PUBLISHING,
          }),
        );

        act(() => {
          result.current.setDescriptionDraft('Edited description');
        });

        expect(patch).not.toHaveBeenCalled();

        await act(async () => {
          await vi.advanceTimersByTimeAsync(5_000);
        });

        expect(patch).toHaveBeenCalledWith('post-1', {
          description: 'Edited description',
        });
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
