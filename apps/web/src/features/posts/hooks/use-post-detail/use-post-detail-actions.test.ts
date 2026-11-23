import type { IPost } from '@genfeedai/contracts/interfaces';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePostDetailActions } from '@/features/posts/hooks/use-post-detail/use-post-detail-actions';

const { mockConfirmPostRemoval } = vi.hoisted(() => ({
  mockConfirmPostRemoval: vi.fn(),
}));

vi.mock(
  '@/features/posts/hooks/use-confirm-post-removal/use-confirm-post-removal',
  () => ({
    useConfirmPostRemoval: vi.fn(() => mockConfirmPostRemoval),
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
  const mockServiceRetry = vi.fn();
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
    info: vi.fn(),
    success: vi.fn(),
  };
  const mockRouter = { push: vi.fn(), replace: vi.fn() };
  const mockFetchPost = vi.fn();
  const mockUpdateActivePost = vi.fn();
  const mockSetIsSavingDescription = vi.fn();
  const mockSetIsSavingSchedule = vi.fn();
  const mockSetEnhancingPostId = vi.fn();
  const mockSetEnhancingAction = vi.fn();

  const makeAutoSaveRefs = () => ({
    currentDescriptions: { current: new Map<string, string>() },
    currentLabels: { current: new Map<string, string>() },
    lastSavedDescriptions: { current: new Map<string, string>() },
    lastSavedLabels: { current: new Map<string, string>() },
    timeouts: { current: new Map<string, NodeJS.Timeout>() },
  });

  const baseProps = {
    autoSaveRefs: makeAutoSaveRefs(),
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
    mockServiceEnhance.mockResolvedValue({
      description: 'Enhanced text',
      id: 'post-1',
    });
    mockServiceRetry.mockResolvedValue({ id: 'post-1' });
    mockGetPostsService.mockResolvedValue({
      retry: mockServiceRetry,
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
      expect(mockFetchPost).toHaveBeenCalledWith();
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

    it('retries a failed post through the retry endpoint, not the release schedule', async () => {
      const { result } = renderHook(() => usePostDetailActions(baseProps));

      await act(async () => {
        await result.current.handleRetryPublish();
      });

      expect(mockServiceRetry).toHaveBeenCalledWith('post-1');
      expect(mockPublishNow).not.toHaveBeenCalled();
      expect(mockFetchPost).toHaveBeenCalledWith();
      expect(mockNotificationsService.success).toHaveBeenCalledWith(
        'Retrying publish',
      );
    });

    it('reports the queued TikTok Inbox upload before the provider confirms delivery', async () => {
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
      expect(mockNotificationsService.info).toHaveBeenCalledWith(
        'TikTok Inbox upload queued',
      );
      expect(mockNotificationsService.success).not.toHaveBeenCalled();
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

      expect(mockConfirmPostRemoval).not.toHaveBeenCalled();
    });

    it('asks to delete this post and navigates away once it is removed', async () => {
      const { result } = renderHook(() => usePostDetailActions(baseProps));

      act(() => {
        result.current.handleDeletePost();
      });

      const [posts, onRemoved] = mockConfirmPostRemoval.mock.calls[0] as [
        IPost[],
        (removedIds: string[]) => Promise<void>,
      ];
      expect(posts.map((post) => post.id)).toEqual(['post-1']);
      expect(mockRouter.push).not.toHaveBeenCalled();

      await act(async () => {
        await onRemoved(['post-1']);
      });

      expect(mockRouter.push).toHaveBeenCalledWith('/acme/publishing');
    });

    it('settles unsaved edits of a deleted post so no auto-save patches it', async () => {
      const autoSaveRefs = makeAutoSaveRefs();
      autoSaveRefs.currentDescriptions.current.set('post-1', 'Typed text');
      autoSaveRefs.timeouts.current.set('post-1', {} as NodeJS.Timeout);
      const { result } = renderHook(() =>
        usePostDetailActions({ ...baseProps, autoSaveRefs }),
      );

      act(() => {
        result.current.handleDeletePost();
      });
      const onRemoved = mockConfirmPostRemoval.mock.calls[0][1] as (
        removedIds: string[],
      ) => Promise<void>;
      await act(async () => {
        await onRemoved(['post-1']);
      });

      expect(autoSaveRefs.timeouts.current.size).toBe(0);
      expect(autoSaveRefs.lastSavedDescriptions.current.get('post-1')).toBe(
        'Typed text',
      );
    });

    it('keeps unsaved edits pending until the post is removed', () => {
      const autoSaveRefs = makeAutoSaveRefs();
      autoSaveRefs.currentDescriptions.current.set('post-1', 'Typed text');
      const { result } = renderHook(() =>
        usePostDetailActions({ ...baseProps, autoSaveRefs }),
      );

      act(() => {
        result.current.handleDeletePost();
      });

      expect(autoSaveRefs.lastSavedDescriptions.current.has('post-1')).toBe(
        false,
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

  describe('rewrite failure reasons (#7679)', () => {
    it.each([
      {
        errors: [
          {
            detail: 'The AI returned no text for this rewrite. Try again.',
            status: '503',
          },
        ],
      },
      {
        response: {
          data: {
            errors: [
              {
                detail: 'The AI returned no text for this rewrite. Try again.',
                status: 503,
              },
            ],
          },
        },
      },
      {
        errors: [
          {
            detail: 'The AI returned no text for this rewrite. Try again.',
            code: '503',
          },
        ],
      },
    ])(
      'shows the documented unavailable reason from JSON:API: %j',
      async (error) => {
        mockServiceEnhance.mockRejectedValue(error);
        const { result } = renderHook(() => usePostDetailActions(baseProps));

        let draft: string | null = 'unset';
        await act(async () => {
          draft = await result.current.handlePerTweetEnhance(
            'post-1',
            'prompt',
          );
        });

        expect(draft).toBeNull();
        expect(mockNotificationsService.error).toHaveBeenCalledExactlyOnceWith(
          'Failed to rewrite. The AI returned no text for this rewrite. Try again.',
        );
        expect(mockUpdateActivePost).not.toHaveBeenCalled();
        expect(mockSetEnhancingPostId).toHaveBeenLastCalledWith(null);
        expect(mockSetEnhancingAction).toHaveBeenLastCalledWith(null);
      },
    );

    it.each([400, 401, 403, 404, 429, 500, 502, 504])(
      'suppresses even documented detail on HTTP %s',
      async (status) => {
        mockServiceEnhance.mockRejectedValue({
          errors: [
            {
              detail: 'The AI returned no text for this rewrite. Try again.',
              status,
            },
          ],
        });
        const { result } = renderHook(() => usePostDetailActions(baseProps));

        await act(async () => {
          expect(
            await result.current.handlePerTweetEnhance('post-1', 'prompt'),
          ).toBeNull();
        });

        expect(mockNotificationsService.error).toHaveBeenCalledExactlyOnceWith(
          'Failed to rewrite. Try again.',
        );
        expect(mockUpdateActivePost).not.toHaveBeenCalled();
      },
    );

    it.each([
      null,
      new Error('Internal provider failure'),
      { errors: 'malformed' },
      { errors: [null, 'malformed'] },
      { errors: [{ detail: { message: 'private' }, status: '503' }] },
      { errors: [{ detail: 503, status: '503' }] },
      { errors: [{ title: 'Internal provider failure', status: '503' }] },
      {
        errors: [
          { detail: 'The AI returned no text for this rewrite. Try again.' },
        ],
      },
      { errors: [{ detail: 'Internal provider failure', status: '422' }] },
      {
        errors: [
          {
            detail: 'The AI returned no text for this rewrite. Try again.',
            status: '422',
          },
        ],
      },
      {
        errors: [
          {
            detail:
              'The rewrite does not fit the 280-character limit for twitter. Shorten the instruction or the draft and try again. Internal failure',
            status: '422',
          },
        ],
      },
    ])(
      'uses a visible generic error for unsuitable payload: %j',
      async (error) => {
        mockServiceEnhance.mockRejectedValue(error);
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
        expect(mockNotificationsService.error).toHaveBeenCalledExactlyOnceWith(
          'Failed to rewrite. Try again.',
        );
        expect(mockUpdateActivePost).not.toHaveBeenCalled();
        expect(mockFetchPost).not.toHaveBeenCalled();
        expect(mockSetEnhancingPostId).toHaveBeenLastCalledWith(null);
        expect(mockSetEnhancingAction).toHaveBeenLastCalledWith(null);
      },
    );

    it.each([
      'Provider request failed: internal configuration',
      'Contact private-user@example.test for access',
      'Authorization: Bearer synthetic-private-token',
      'The AI returned no text for this rewrite. Try again.\nInternal failure',
      '<script>internalFailure()</script>',
      'x'.repeat(201),
      ' '.repeat(400),
    ])('suppresses unsuitable 503 detail: %j', async (detail) => {
      mockServiceEnhance.mockRejectedValue({
        errors: [{ detail, status: '503' }],
      });
      const { result } = renderHook(() => usePostDetailActions(baseProps));

      let draft: string | null = 'unset';
      await act(async () => {
        draft = await result.current.handlePerTweetEnhance('post-1', 'prompt');
      });

      expect(draft).toBeNull();
      expect(mockNotificationsService.error).toHaveBeenCalledExactlyOnceWith(
        'Failed to rewrite. Try again.',
      );
      expect(mockUpdateActivePost).not.toHaveBeenCalled();
      expect(mockFetchPost).not.toHaveBeenCalled();
    });

    it('suppresses short internal details and preserves the original draft', async () => {
      mockServiceEnhance.mockRejectedValue({
        errors: [
          {
            detail: 'Provider request failed: internal configuration',
            status: '500',
          },
        ],
      });
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
      expect(mockNotificationsService.error).toHaveBeenCalledExactlyOnceWith(
        'Failed to rewrite. Try again.',
      );
      expect(mockUpdateActivePost).not.toHaveBeenCalled();
      expect(mockFetchPost).not.toHaveBeenCalled();
      expect(POST.description).toBe('Parent description');
      expect(baseProps.descriptionDraft).toBe('Draft description');
      expect(mockSetEnhancingPostId).toHaveBeenLastCalledWith(null);
      expect(mockSetEnhancingAction).toHaveBeenLastCalledWith(null);
    });

    it('shows the documented platform-limit reason', async () => {
      mockServiceEnhance.mockRejectedValue({
        errors: [
          {
            detail:
              'The rewrite does not fit the 280-character limit for twitter. Shorten the instruction or the draft and try again.',
            status: '422',
            title: 'Enhancement failed',
          },
        ],
      });
      const { result } = renderHook(() => usePostDetailActions(baseProps));

      await act(async () => {
        await result.current.handlePerTweetEnhance('post-1', 'prompt');
      });

      expect(mockNotificationsService.error).toHaveBeenCalledWith(
        'Failed to rewrite. The rewrite does not fit the 280-character limit for twitter. Shorten the instruction or the draft and try again.',
      );
    });

    it('keeps the generic message for a long provider detail', async () => {
      mockServiceEnhance.mockRejectedValue({
        errors: [{ detail: 'x'.repeat(400), status: '500' }],
      });
      const { result } = renderHook(() => usePostDetailActions(baseProps));

      await act(async () => {
        await result.current.handlePerTweetEnhance('post-1', 'prompt');
      });

      expect(mockNotificationsService.error).toHaveBeenCalledWith(
        'Failed to rewrite. Try again.',
      );
    });

    it('says so when the draft has no text instead of resetting silently', async () => {
      mockServiceEnhance.mockResolvedValue({ description: '', id: 'post-1' });
      const { result } = renderHook(() => usePostDetailActions(baseProps));

      await act(async () => {
        await result.current.handlePerTweetEnhance('post-1', 'prompt');
      });

      expect(mockNotificationsService.error).toHaveBeenCalledWith(
        'The AI returned no text for this rewrite. Try again.',
      );
    });
  });

  describe('complete rewrite proposals (#7679)', () => {
    it.each([104, 198, 280])(
      'returns a complete %s-character rewrite through both callbacks without saving it',
      async (length) => {
        const originalDraft = 'Original draft stays editable.';
        const proposedText = `${'a'.repeat(length - 5)} END.`;
        mockServiceEnhance.mockResolvedValue({
          description: proposedText,
          id: 'post-1',
        });
        const { result } = renderHook(() =>
          usePostDetailActions({
            ...baseProps,
            descriptionDraft: originalDraft,
          }),
        );

        await act(async () => {
          expect(
            await result.current.handleQuickAction(
              'post-1',
              'Make this clearer and more engaging.',
              'boost',
              'professional',
            ),
          ).toBe(proposedText);
          expect(
            await result.current.handlePerTweetEnhance(
              'post-1',
              'Make this clearer and more engaging.',
              'professional',
            ),
          ).toBe(proposedText);
        });

        expect(mockServiceEnhance).toHaveBeenCalledWith(
          'post-1',
          'Make this clearer and more engaging.',
          'professional',
          { isDraft: true },
        );
        expect(mockUpdateActivePost).not.toHaveBeenCalled();
        expect(mockFetchPost).not.toHaveBeenCalled();
        expect(mockNotificationsService.error).not.toHaveBeenCalled();
        expect(mockSetEnhancingPostId).toHaveBeenLastCalledWith(null);
        expect(mockSetEnhancingAction).toHaveBeenLastCalledWith(null);
      },
    );
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
