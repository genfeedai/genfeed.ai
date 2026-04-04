import { usePostDetailDrafts } from '@hooks/pages/use-post-detail/use-post-detail-drafts';
import { act, renderHook } from '@testing-library/react';
import { PageScope } from '@ui-constants/misc.constant';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/content/posts.service', () => ({
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
});
