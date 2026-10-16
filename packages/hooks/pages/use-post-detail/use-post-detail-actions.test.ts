import type { IPost } from '@genfeedai/contracts/interfaces';
import { usePostDetailActions } from '@hooks/pages/use-post-detail/use-post-detail-actions';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockOpenConfirmDelete } = vi.hoisted(() => ({
  mockOpenConfirmDelete: vi.fn(),
}));

vi.mock(
  '@genfeedai/contexts/providers/global-modals/global-modals.provider',
  () => ({
    useConfirmDeleteModal: vi.fn(() => ({
      openConfirmDelete: mockOpenConfirmDelete,
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

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: vi.fn(() => ({ href: (path: string) => `/acme${path}` })),
}));

const POST = {
  description: 'Parent description',
  id: 'post-1',
  label: 'Parent',
} as unknown as IPost;

describe('usePostDetailActions', () => {
  const mockServiceDelete = vi.fn();
  const mockServiceEnhance = vi.fn();
  const mockServiceDraftThread = vi.fn();
  const mockGetPostsService = vi.fn();
  const mockEnsureFromPost = vi.fn();
  const mockScheduleTarget = vi.fn();
  const mockPublishNow = vi.fn();
  const mockPublishViaTikTokApp = vi.fn();
  const mockGetReleaseGroupsService = vi.fn();
  const mockNotificationsService = {
    error: vi.fn(),
    success: vi.fn(),
  };
  const mockRouter = { push: vi.fn(), replace: vi.fn() };
  const mockFetchPost = vi.fn();
  const mockUpdateActivePost = vi.fn();
  const mockSetIsSavingDescription = vi.fn();
  const mockSetIsSavingSchedule = vi.fn();
  const mockSetEnhancingPostId = vi.fn();
  const mockSetEnhancingAction = vi.fn();

  const baseProps = {
    descriptionDraft: 'Draft description',
    fetchPost: mockFetchPost,
    getPostsService: mockGetPostsService,
    getReleaseGroupsService: mockGetReleaseGroupsService,
    isContentDirty: false,
    isDescriptionDirty: false,
    isLabelDirty: false,
    isScheduleDirty: false,
    labelDraft: 'Draft label',
    notificationsService: mockNotificationsService as never,
    post: POST,
    router: mockRouter as never,
    scheduleDraft: '',
    setEnhancingAction: mockSetEnhancingAction,
    setEnhancingPostId: mockSetEnhancingPostId,
    setIsSavingDescription: mockSetIsSavingDescription,
    setIsSavingSchedule: mockSetIsSavingSchedule,
    updateActivePost: mockUpdateActivePost,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchPost.mockResolvedValue(undefined);
    mockUpdateActivePost.mockResolvedValue(POST);
    mockServiceDelete.mockResolvedValue(undefined);
    mockServiceEnhance.mockResolvedValue({
      description: 'Enhanced text',
      id: 'post-1',
    });
    mockGetPostsService.mockResolvedValue({
      delete: mockServiceDelete,
      draftThread: mockServiceDraftThread,
      enhance: mockServiceEnhance,
    });
    mockServiceDraftThread.mockResolvedValue(['Reply one', 'Reply two']);
    mockEnsureFromPost.mockResolvedValue({ id: 'group-1' });
    mockScheduleTarget.mockResolvedValue({ id: 'group-1' });
    mockPublishNow.mockResolvedValue({ id: 'group-1' });
    mockPublishViaTikTokApp.mockResolvedValue({ id: 'group-1' });
    mockGetReleaseGroupsService.mockResolvedValue({
      ensureFromPost: mockEnsureFromPost,
      publishTargetNow: mockPublishNow,
      publishTargetViaTikTokApp: mockPublishViaTikTokApp,
      scheduleTarget: mockScheduleTarget,
    });
  });

  describe('handleContentSave', () => {
    it('skips saving when content is clean', async () => {
      const { result } = renderHook(() => usePostDetailActions(baseProps));

      await act(async () => {
        await result.current.handleContentSave();
      });

      expect(mockUpdateActivePost).not.toHaveBeenCalled();
    });

    it('saves dirty description and trimmed label', async () => {
      const { result } = renderHook(() =>
        usePostDetailActions({
          ...baseProps,
          isContentDirty: true,
          isDescriptionDirty: true,
          isLabelDirty: true,
          labelDraft: '  Padded label  ',
        }),
      );

      await act(async () => {
        await result.current.handleContentSave();
      });

      expect(mockUpdateActivePost).toHaveBeenCalledWith(
        { description: 'Draft description', label: 'Padded label' },
        'Post updated',
      );
      expect(mockSetIsSavingDescription).toHaveBeenNthCalledWith(1, true);
      expect(mockSetIsSavingDescription).toHaveBeenLastCalledWith(false);
    });

    it('saves only the dirty field', async () => {
      const { result } = renderHook(() =>
        usePostDetailActions({
          ...baseProps,
          isContentDirty: true,
          isDescriptionDirty: true,
        }),
      );

      await act(async () => {
        await result.current.handleContentSave();
      });

      expect(mockUpdateActivePost).toHaveBeenCalledWith(
        { description: 'Draft description' },
        'Post updated',
      );
    });
  });

  describe('handleScheduleSave', () => {
    it('skips when schedule is clean or post missing', async () => {
      const { result } = renderHook(() => usePostDetailActions(baseProps));

      await act(async () => {
        await result.current.handleScheduleSave();
      });

      expect(mockUpdateActivePost).not.toHaveBeenCalled();
    });

    it('schedules the post when a date is set', async () => {
      const { result } = renderHook(() =>
        usePostDetailActions({
          ...baseProps,
          isScheduleDirty: true,
          scheduleDraft: '2025-06-01T10:00',
        }),
      );

      await act(async () => {
        await result.current.handleScheduleSave();
      });

      expect(mockEnsureFromPost).toHaveBeenCalledWith('post-1');
      expect(mockScheduleTarget).toHaveBeenCalledWith(
        'group-1',
        'post-1',
        '2025-06-01T10:00',
      );
      expect(mockUpdateActivePost).not.toHaveBeenCalled();
      expect(mockFetchPost).toHaveBeenCalledWith(true);
      expect(mockNotificationsService.success).toHaveBeenCalledWith(
        'Schedule date updated',
      );
    });

    it('publishes now through the dedicated server-clock path', async () => {
      const { result } = renderHook(() =>
        usePostDetailActions({
          ...baseProps,
          post: { ...POST, groupId: 'group-9' } as IPost,
        }),
      );

      await act(async () => {
        await result.current.handlePublishNow();
      });

      expect(mockEnsureFromPost).toHaveBeenCalledWith('post-1');
      expect(mockPublishNow).toHaveBeenCalledWith('group-1', 'post-1');
      expect(mockScheduleTarget).not.toHaveBeenCalled();
      expect(mockNotificationsService.success).toHaveBeenCalledWith(
        'Publishing now',
      );
    });

    it('hands a TikTok video to the native app for music and final edits', async () => {
      const { result } = renderHook(() =>
        usePostDetailActions({
          ...baseProps,
          post: { ...POST, groupId: 'group-9' } as IPost,
        }),
      );

      await act(async () => {
        await result.current.handlePublishViaTikTokApp();
      });

      expect(mockEnsureFromPost).toHaveBeenCalledWith('post-1');
      expect(mockPublishViaTikTokApp).toHaveBeenCalledWith('group-1', 'post-1');
      expect(mockPublishNow).not.toHaveBeenCalled();
      expect(mockNotificationsService.success).toHaveBeenCalledWith(
        'Sent to TikTok. Open your TikTok Inbox to add music or final edits, then publish.',
      );
    });

    it('clears the schedule when the draft is empty', async () => {
      const { result } = renderHook(() =>
        usePostDetailActions({ ...baseProps, isScheduleDirty: true }),
      );

      await act(async () => {
        await result.current.handleScheduleSave();
      });

      expect(mockNotificationsService.success).toHaveBeenCalledWith(
        'Schedule date cleared',
      );
    });

    it('notifies when scheduling fails', async () => {
      mockScheduleTarget.mockRejectedValue(new Error('boom'));
      const { result } = renderHook(() =>
        usePostDetailActions({
          ...baseProps,
          isScheduleDirty: true,
          scheduleDraft: '2025-06-01T10:00',
        }),
      );

      await act(async () => {
        await result.current.handleScheduleSave();
      });

      expect(mockNotificationsService.error).toHaveBeenCalledWith(
        'Failed to update schedule',
      );
      expect(mockSetIsSavingSchedule).toHaveBeenLastCalledWith(false);
    });
  });

  describe('handleDeletePost', () => {
    it('does nothing without a post', () => {
      const { result } = renderHook(() =>
        usePostDetailActions({ ...baseProps, post: null }),
      );

      act(() => {
        result.current.handleDeletePost();
      });

      expect(mockOpenConfirmDelete).not.toHaveBeenCalled();
    });

    it('deletes the post after confirmation and navigates away', async () => {
      const { result } = renderHook(() => usePostDetailActions(baseProps));

      act(() => {
        result.current.handleDeletePost();
      });

      const confirm = mockOpenConfirmDelete.mock.calls[0][0] as {
        entity: { id: string; label: string };
        entityName: string;
        onConfirm: () => Promise<void>;
      };
      expect(confirm.entity).toEqual({ id: 'post-1', label: 'Parent' });
      expect(confirm.entityName).toBe('post');

      await act(async () => {
        await confirm.onConfirm();
      });

      expect(mockServiceDelete).toHaveBeenCalledWith('post-1');
      expect(mockNotificationsService.success).toHaveBeenCalledWith(
        'Post deleted successfully',
      );
      expect(mockRouter.push).toHaveBeenCalledWith('/acme/publishing');
    });

    it('notifies when the delete fails', async () => {
      mockServiceDelete.mockRejectedValue(new Error('boom'));
      const { result } = renderHook(() => usePostDetailActions(baseProps));

      act(() => {
        result.current.handleDeletePost();
      });

      const confirm = mockOpenConfirmDelete.mock.calls[0][0] as {
        onConfirm: () => Promise<void>;
      };
      await act(async () => {
        await confirm.onConfirm();
      });

      expect(mockNotificationsService.error).toHaveBeenCalledWith(
        'Failed to delete post',
      );
    });
  });

  describe('handleQuickAction', () => {
    it('does nothing without a post', async () => {
      const { result } = renderHook(() =>
        usePostDetailActions({ ...baseProps, post: null }),
      );

      let draft: string | null = 'unset';
      await act(async () => {
        draft = await result.current.handleQuickAction(
          'post-1',
          'prompt',
          'boost',
        );
      });

      expect(draft).toBeNull();
      expect(mockServiceEnhance).not.toHaveBeenCalled();
    });

    it('requests an unsaved draft and returns the proposed text', async () => {
      const { result } = renderHook(() => usePostDetailActions(baseProps));

      let draft: string | null = null;
      await act(async () => {
        draft = await result.current.handleQuickAction(
          'post-1',
          'make it pop',
          'boost',
          'viral',
        );
      });

      expect(draft).toBe('Enhanced text');
      expect(mockSetEnhancingPostId).toHaveBeenNthCalledWith(1, 'post-1');
      expect(mockSetEnhancingAction).toHaveBeenNthCalledWith(1, 'boost');
      expect(mockServiceEnhance).toHaveBeenCalledWith(
        'post-1',
        'make it pop',
        'viral',
        { isDraft: true },
      );
      expect(mockNotificationsService.success).not.toHaveBeenCalled();
      expect(mockSetEnhancingPostId).toHaveBeenLastCalledWith(null);
      expect(mockSetEnhancingAction).toHaveBeenLastCalledWith(null);
    });

    it('returns null and notifies when the rewrite fails', async () => {
      mockServiceEnhance.mockRejectedValue(new Error('boom'));
      const { result } = renderHook(() => usePostDetailActions(baseProps));

      let draft: string | null = 'unset';
      await act(async () => {
        draft = await result.current.handleQuickAction(
          'post-1',
          'prompt',
          'boost',
        );
      });

      expect(draft).toBeNull();
      expect(mockNotificationsService.error).toHaveBeenCalledWith(
        'Failed to rewrite. Try again.',
      );
      expect(mockSetEnhancingPostId).toHaveBeenLastCalledWith(null);
    });
  });

  describe('handlePerTweetEnhance', () => {
    it('does nothing without a post', async () => {
      const { result } = renderHook(() =>
        usePostDetailActions({ ...baseProps, post: null }),
      );

      await act(async () => {
        await result.current.handlePerTweetEnhance('post-1', 'prompt');
      });

      expect(mockServiceEnhance).not.toHaveBeenCalled();
    });

    it('requests an unsaved draft for any post in the thread', async () => {
      mockServiceEnhance.mockResolvedValue({
        description: 'Child enhanced',
        id: 'child-1',
      });
      const { result } = renderHook(() => usePostDetailActions(baseProps));

      let draft: string | null = null;
      await act(async () => {
        draft = await result.current.handlePerTweetEnhance(
          'child-1',
          'prompt',
          'casual',
        );
      });

      expect(draft).toBe('Child enhanced');
      expect(mockServiceEnhance).toHaveBeenCalledWith(
        'child-1',
        'prompt',
        'casual',
        { isDraft: true },
      );
    });

    it('returns null when the draft has no text', async () => {
      mockServiceEnhance.mockResolvedValue({ description: '', id: 'post-1' });
      const { result } = renderHook(() => usePostDetailActions(baseProps));

      let draft: string | null = 'unset';
      await act(async () => {
        draft = await result.current.handlePerTweetEnhance('post-1', 'prompt');
      });

      expect(draft).toBeNull();
    });
  });

  describe('handleDraftThread', () => {
    it('returns proposed replies without saving', async () => {
      const { result } = renderHook(() => usePostDetailActions(baseProps));

      let draft: string[] | null = null;
      await act(async () => {
        draft = await result.current.handleDraftThread('post-1', 'casual');
      });

      expect(draft).toEqual(['Reply one', 'Reply two']);
      expect(mockServiceDraftThread).toHaveBeenCalledWith(
        'post-1',
        4,
        'casual',
      );
      expect(mockSetEnhancingPostId).toHaveBeenNthCalledWith(1, 'post-1');
      expect(mockSetEnhancingPostId).toHaveBeenLastCalledWith(null);
    });

    it('returns null and notifies when drafting fails', async () => {
      mockServiceDraftThread.mockRejectedValue(new Error('boom'));
      const { result } = renderHook(() => usePostDetailActions(baseProps));

      let draft: string[] | null = ['unset'];
      await act(async () => {
        draft = await result.current.handleDraftThread('post-1');
      });

      expect(draft).toBeNull();
      expect(mockNotificationsService.error).toHaveBeenCalledWith(
        'Failed to draft the thread. Try again.',
      );
    });
  });
});
