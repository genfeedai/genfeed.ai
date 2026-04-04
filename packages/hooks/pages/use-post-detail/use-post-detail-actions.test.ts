import { usePostDetailActions } from '@hooks/pages/use-post-detail/use-post-detail-actions';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@providers/global-modals/global-modals.provider', () => ({
  useConfirmDeleteModal: vi.fn(() => ({
    openConfirmDelete: vi.fn(),
  })),
}));

vi.mock('@services/content/posts.service', () => ({
  PostsService: {
    getInstance: vi.fn(),
  },
}));

describe('usePostDetailActions', () => {
  const mockGetPostsService = vi.fn().mockResolvedValue({
    delete: vi.fn().mockResolvedValue(undefined),
    patch: vi.fn().mockResolvedValue({}),
  });
  const mockNotificationsService = {
    error: vi.fn(),
    success: vi.fn(),
  };
  const mockRouter = { push: vi.fn(), replace: vi.fn() };
  const mockFetchPost = vi.fn().mockResolvedValue(undefined);
  const mockUpdateActivePost = vi.fn().mockResolvedValue({});
  const mockHandleUpdateChild = vi.fn();
  const mockUpdateDescriptionRefs = vi.fn();
  const mockSetPost = vi.fn();
  const mockSetIsSavingDescription = vi.fn();
  const mockSetIsSavingSchedule = vi.fn();
  const mockSetEnhancingPostId = vi.fn();
  const mockSetEnhancingAction = vi.fn();
  const mockSetChildDescriptions = vi.fn();

  const baseProps = {
    descriptionDraft: 'Draft description',
    fetchPost: mockFetchPost,
    getPostsService: mockGetPostsService,
    handleUpdateChild: mockHandleUpdateChild,
    isContentDirty: false,
    isDescriptionDirty: false,
    isLabelDirty: false,
    isScheduleDirty: false,
    labelDraft: 'Draft label',
    notificationsService: mockNotificationsService as never,
    post: null,
    router: mockRouter as never,
    scheduleDraft: '',
    setChildDescriptions: mockSetChildDescriptions,
    setDescriptionDraft: vi.fn(),
    setEnhancingAction: mockSetEnhancingAction,
    setEnhancingPostId: mockSetEnhancingPostId,
    setIsSavingDescription: mockSetIsSavingDescription,
    setIsSavingSchedule: mockSetIsSavingSchedule,
    setPost: mockSetPost,
    updateActivePost: mockUpdateActivePost,
    updateDescriptionRefs: mockUpdateDescriptionRefs,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns required handler functions', () => {
    const { result } = renderHook(() => usePostDetailActions(baseProps));
    expect(result.current).toHaveProperty('handleContentSave');
    expect(result.current).toHaveProperty('handleScheduleSave');
    expect(result.current).toHaveProperty('handleDeletePost');
    expect(result.current).toHaveProperty('handleQuickAction');
    expect(result.current).toHaveProperty('handlePerTweetEnhance');
  });

  it('all returned fields are functions', () => {
    const { result } = renderHook(() => usePostDetailActions(baseProps));
    expect(typeof result.current.handleContentSave).toBe('function');
    expect(typeof result.current.handleScheduleSave).toBe('function');
    expect(typeof result.current.handleDeletePost).toBe('function');
    expect(typeof result.current.handleQuickAction).toBe('function');
    expect(typeof result.current.handlePerTweetEnhance).toBe('function');
  });

  it('handleDeletePost does not throw', () => {
    const { result } = renderHook(() => usePostDetailActions(baseProps));
    expect(() => {
      act(() => {
        result.current.handleDeletePost();
      });
    }).not.toThrow();
  });
});
