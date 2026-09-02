import { Status } from '@genfeedai/contracts';
import type { IPost } from '@genfeedai/contracts/interfaces';
import type { PostsService } from '@genfeedai/services/content/posts.service';
import type { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { WebSocketPaths } from '@genfeedai/utils/network/websocket.util';
import {
  type UsePostDetailThreadOptions,
  usePostDetailThread,
} from '@hooks/pages/use-post-detail/use-post-detail-thread';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseSocketSubscriptions = vi.fn();

vi.mock('@genfeedai/services/content/posts.service', () => ({
  PostsService: { getInstance: vi.fn() },
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('@hooks/utils/use-socket-manager/use-socket-manager', () => ({
  useSocketSubscriptions: (subscriptions: unknown) =>
    mockUseSocketSubscriptions(subscriptions),
}));

interface SocketSubscription {
  event: string;
  handler: (data: { status: Status; result?: IPost; error?: string }) => void;
}

function createPost(overrides: Partial<IPost> = {}): IPost {
  return {
    children: [],
    credential: { id: 'cred-1' },
    description: 'Parent post',
    id: 'post-1',
    label: 'Parent',
    order: 0,
    ...overrides,
  } as unknown as IPost;
}

function createChild(
  id: string,
  order: number,
  description = `Tweet ${order}`,
): IPost {
  return {
    description,
    id,
    label: `Child ${order}`,
    order,
  } as unknown as IPost;
}

describe('usePostDetailThread', () => {
  const mockServicePost = vi.fn();
  const mockServicePatch = vi.fn();
  const mockServiceDelete = vi.fn();
  const mockExpandToThread = vi.fn();
  const mockGetPostsService = vi.fn();
  const mockFetchPost = vi.fn();
  const mockSetPost = vi.fn();
  const mockUpdateDescriptionRefs = vi.fn();
  const mockUpdateLabelRefs = vi.fn();
  const mockSetChildDescription = vi.fn();
  const mockSetIsExpandingToThread = vi.fn();
  const mockSetGeneratingChildPostIds = vi.fn();
  const mockSetIsTogglingGrok = vi.fn();
  const mockSetIsTogglingFirstComment = vi.fn();
  const notificationsService = {
    error: vi.fn(),
    success: vi.fn(),
  } as unknown as NotificationsService;

  function buildOptions(
    overrides: Partial<UsePostDetailThreadOptions> = {},
  ): UsePostDetailThreadOptions {
    return {
      canAddThread: true,
      fetchPost: mockFetchPost,
      firstCommentPost: null,
      generatingChildPostIds: new Set<string>(),
      getPostsService:
        mockGetPostsService as unknown as () => Promise<PostsService>,
      hasInitiatedExpansionRef: { current: false },
      isExpandingToThread: false,
      isLastChildGrokTweet: false,
      notificationsService,
      post: createPost(),
      setChildDescription: mockSetChildDescription,
      setGeneratingChildPostIds: mockSetGeneratingChildPostIds,
      setIsExpandingToThread: mockSetIsExpandingToThread,
      setIsTogglingFirstComment: mockSetIsTogglingFirstComment,
      setIsTogglingGrok: mockSetIsTogglingGrok,
      setPost: mockSetPost,
      sortedChildren: [],
      updateDescriptionRefs: mockUpdateDescriptionRefs,
      updateLabelRefs: mockUpdateLabelRefs,
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockServicePost.mockResolvedValue(
      createChild('child-new', 1, "What's happening?"),
    );
    mockServicePatch.mockImplementation(
      (id: string, patch: { order: number }) =>
        Promise.resolve(createChild(id, patch.order)),
    );
    mockServiceDelete.mockResolvedValue(undefined);
    mockExpandToThread.mockResolvedValue([]);
    mockGetPostsService.mockResolvedValue({
      delete: mockServiceDelete,
      expandToThread: mockExpandToThread,
      patch: mockServicePatch,
      post: mockServicePost,
    });
    mockFetchPost.mockResolvedValue(undefined);
  });

  describe('handleAddToThread', () => {
    it('adds a draft tweet at the end of the thread', async () => {
      const child = createChild('child-1', 1);
      const { result } = renderHook(() =>
        usePostDetailThread(buildOptions({ sortedChildren: [child] })),
      );

      await act(async () => {
        await result.current.handleAddToThread();
      });

      expect(mockServicePost).toHaveBeenCalledWith(
        expect.objectContaining({
          credentialId: 'cred-1',
          order: 2,
          parentId: 'post-1',
        }),
      );

      const updater = mockSetPost.mock.calls[0][0] as (
        prev: IPost | null,
      ) => IPost | null;
      const previous = createPost({ children: [child] });
      const next = updater(previous);
      expect(next?.children).toHaveLength(2);
      expect(updater(null)).toBeNull();

      expect(mockSetChildDescription).toHaveBeenCalledWith(
        'child-new',
        "What's happening?",
      );
      expect(notificationsService.success).toHaveBeenCalledWith(
        'New tweet added to thread',
      );
    });

    it('keeps a trailing grok tweet last by bumping its order', async () => {
      const child = createChild('child-1', 1);
      const grok = createChild('grok-1', 2, '@grok what do you think?');
      const { result } = renderHook(() =>
        usePostDetailThread(buildOptions({ sortedChildren: [child, grok] })),
      );

      await act(async () => {
        await result.current.handleAddToThread();
      });

      expect(mockServicePost).toHaveBeenCalledWith(
        expect.objectContaining({ order: 2 }),
      );
      expect(mockServicePatch).toHaveBeenCalledWith('grok-1', { order: 4 });

      const updater = mockSetPost.mock.calls[0][0] as (
        prev: IPost | null,
      ) => IPost | null;
      const next = updater(createPost({ children: [child, grok] }));
      const updatedGrok = next?.children?.find((c) => c.id === 'grok-1');
      expect(updatedGrok?.order).toBe(4);
    });

    it('does nothing when adding is not allowed', async () => {
      const { result } = renderHook(() =>
        usePostDetailThread(buildOptions({ canAddThread: false })),
      );

      await act(async () => {
        await result.current.handleAddToThread();
      });

      expect(mockServicePost).not.toHaveBeenCalled();
    });

    it('notifies on failure', async () => {
      mockServicePost.mockRejectedValue(new Error('boom'));
      const { result } = renderHook(() => usePostDetailThread(buildOptions()));

      await act(async () => {
        await result.current.handleAddToThread();
      });

      expect(notificationsService.error).toHaveBeenCalledWith(
        'Failed to add tweet to thread',
      );
    });

    it('fails without a publishing credential', async () => {
      const { result } = renderHook(() =>
        usePostDetailThread(
          buildOptions({ post: createPost({ credential: undefined }) }),
        ),
      );

      await act(async () => {
        await result.current.handleAddToThread();
      });

      expect(mockServicePost).not.toHaveBeenCalled();
      expect(notificationsService.error).toHaveBeenCalledWith(
        'Failed to add tweet to thread',
      );
    });

    it('uses the scalar credentialId when the populated credential is missing', async () => {
      const { result } = renderHook(() =>
        usePostDetailThread(
          buildOptions({
            post: createPost({
              credential: undefined,
              credentialId: 'cred-scalar',
            }),
          }),
        ),
      );

      await act(async () => {
        await result.current.handleAddToThread();
      });

      expect(mockServicePost).toHaveBeenCalledWith(
        expect.objectContaining({ credentialId: 'cred-scalar' }),
      );
    });

    it('does not read a Document _id alias off the credential', async () => {
      const { result } = renderHook(() =>
        usePostDetailThread(
          buildOptions({
            post: createPost({
              credential: { _id: 'legacy-cred' } as never,
              credentialId: undefined,
            }),
          }),
        ),
      );

      await act(async () => {
        await result.current.handleAddToThread();
      });

      expect(mockServicePost).not.toHaveBeenCalled();
      expect(notificationsService.error).toHaveBeenCalledWith(
        'Failed to add tweet to thread',
      );
    });

    it('fails closed when the post id is missing', async () => {
      const { result } = renderHook(() =>
        usePostDetailThread(
          buildOptions({
            post: createPost({ id: undefined as unknown as string }),
          }),
        ),
      );

      await act(async () => {
        await result.current.handleAddToThread();
      });

      expect(mockServicePost).not.toHaveBeenCalled();
      expect(notificationsService.error).toHaveBeenCalledWith(
        'Failed to add tweet to thread',
      );
    });
  });

  describe('handleExpandToThread', () => {
    it('expands the post and tracks generating children', async () => {
      const hasInitiatedExpansionRef = { current: false };
      mockExpandToThread.mockResolvedValue([
        createPost(),
        createChild('child-a', 1),
        createChild('child-b', 2),
      ]);

      const { result } = renderHook(() =>
        usePostDetailThread(buildOptions({ hasInitiatedExpansionRef })),
      );

      await act(async () => {
        await result.current.handleExpandToThread(3);
      });

      expect(mockSetIsExpandingToThread).toHaveBeenCalledWith(true);
      expect(mockExpandToThread).toHaveBeenCalledWith('post-1', 3);
      expect(mockSetGeneratingChildPostIds).toHaveBeenCalledWith(
        new Set(['child-a', 'child-b']),
      );
      expect(hasInitiatedExpansionRef.current).toBe(true);
      expect(mockFetchPost).toHaveBeenCalledWith(true);
      expect(notificationsService.success).toHaveBeenCalledWith(
        'Expanding post to 3-tweet thread...',
      );
    });

    it('resets state when expansion fails', async () => {
      const hasInitiatedExpansionRef = { current: false };
      mockExpandToThread.mockRejectedValue(new Error('boom'));

      const { result } = renderHook(() =>
        usePostDetailThread(buildOptions({ hasInitiatedExpansionRef })),
      );

      await act(async () => {
        await result.current.handleExpandToThread(2);
      });

      expect(notificationsService.error).toHaveBeenCalledWith(
        'Failed to expand post to thread',
      );
      expect(mockSetIsExpandingToThread).toHaveBeenCalledWith(false);
      expect(mockSetGeneratingChildPostIds).toHaveBeenCalledWith(new Set());
      expect(hasInitiatedExpansionRef.current).toBe(false);
    });
  });

  describe('websocket child updates', () => {
    it('registers subscriptions for generating child posts', () => {
      renderHook(() =>
        usePostDetailThread(
          buildOptions({
            generatingChildPostIds: new Set(['child-a']),
          }),
        ),
      );

      const subscriptions = mockUseSocketSubscriptions.mock.calls.at(
        -1,
      )?.[0] as SocketSubscription[];
      expect(subscriptions).toHaveLength(1);
      expect(subscriptions[0].event).toBe(
        WebSocketPaths.publication('child-a'),
      );
    });

    it('applies a completed child update', () => {
      renderHook(() =>
        usePostDetailThread(
          buildOptions({
            generatingChildPostIds: new Set(['child-a']),
          }),
        ),
      );

      const subscriptions = mockUseSocketSubscriptions.mock.calls.at(
        -1,
      )?.[0] as SocketSubscription[];
      const updatedChild = createChild('child-a', 1, 'Generated text');

      act(() => {
        subscriptions[0].handler({
          result: updatedChild,
          status: Status.COMPLETED,
        });
      });

      const updater = mockSetPost.mock.calls[0][0] as (
        prev: IPost | null,
      ) => IPost | null;
      const previous = createPost({
        children: [createChild('child-a', 1, 'Old text')],
      });
      const next = updater(previous);
      expect(next?.children?.[0].description).toBe('Generated text');
      expect(updater(null)).toBeNull();

      expect(mockSetChildDescription).toHaveBeenCalledWith(
        'child-a',
        'Generated text',
      );
      expect(mockUpdateDescriptionRefs).toHaveBeenCalledWith(
        'child-a',
        'Generated text',
      );
      expect(mockUpdateLabelRefs).toHaveBeenCalledWith('child-a', 'Child 1');

      const setUpdater = mockSetGeneratingChildPostIds.mock.calls[0][0] as (
        prev: Set<string>,
      ) => Set<string>;
      expect(setUpdater(new Set(['child-a', 'child-b']))).toEqual(
        new Set(['child-b']),
      );
    });

    it('notifies when a child generation fails', () => {
      renderHook(() =>
        usePostDetailThread(
          buildOptions({
            generatingChildPostIds: new Set(['child-a']),
          }),
        ),
      );

      const subscriptions = mockUseSocketSubscriptions.mock.calls.at(
        -1,
      )?.[0] as SocketSubscription[];

      act(() => {
        subscriptions[0].handler({
          error: 'generation exploded',
          status: Status.FAILED,
        });
      });

      expect(notificationsService.error).toHaveBeenCalledWith(
        'generation exploded',
      );
      const setUpdater = mockSetGeneratingChildPostIds.mock.calls[0][0] as (
        prev: Set<string>,
      ) => Set<string>;
      expect(setUpdater(new Set(['child-a']))).toEqual(new Set());
    });
  });

  describe('expansion completion effect', () => {
    it('announces completion when all children finish', () => {
      const hasInitiatedExpansionRef = { current: true };

      renderHook(() =>
        usePostDetailThread(
          buildOptions({
            generatingChildPostIds: new Set<string>(),
            hasInitiatedExpansionRef,
            isExpandingToThread: true,
          }),
        ),
      );

      expect(mockSetIsExpandingToThread).toHaveBeenCalledWith(false);
      expect(hasInitiatedExpansionRef.current).toBe(false);
      expect(notificationsService.success).toHaveBeenCalledWith(
        'Thread expansion completed',
      );
    });
  });

  describe('handleToggleGrokFeedback', () => {
    it('adds a grok feedback tweet when checked', async () => {
      mockServicePost.mockResolvedValue(
        createChild('grok-new', 1, '@grok question'),
      );
      const { result } = renderHook(() => usePostDetailThread(buildOptions()));

      await act(async () => {
        await result.current.handleToggleGrokFeedback(true);
      });

      expect(mockSetIsTogglingGrok).toHaveBeenNthCalledWith(1, true);
      expect(mockServicePost).toHaveBeenCalledWith(
        expect.objectContaining({
          label: 'Grok feedback request',
          order: 1,
          parentId: 'post-1',
        }),
      );
      expect(notificationsService.success).toHaveBeenCalledWith(
        'Grok feedback request tweet added',
      );
      expect(mockSetIsTogglingGrok).toHaveBeenLastCalledWith(false);
    });

    it('removes the trailing grok tweet when unchecked', async () => {
      const grok = createChild('grok-1', 2, '@grok thoughts?');
      const { result } = renderHook(() =>
        usePostDetailThread(
          buildOptions({
            isLastChildGrokTweet: true,
            sortedChildren: [createChild('child-1', 1), grok],
          }),
        ),
      );

      await act(async () => {
        await result.current.handleToggleGrokFeedback(false);
      });

      expect(mockServiceDelete).toHaveBeenCalledWith('grok-1');
      expect(mockSetChildDescription).toHaveBeenCalledWith('grok-1', '');
      expect(notificationsService.success).toHaveBeenCalledWith(
        'Grok feedback request tweet removed',
      );
    });

    it('notifies on failure', async () => {
      mockServicePost.mockRejectedValue(new Error('boom'));
      const { result } = renderHook(() => usePostDetailThread(buildOptions()));

      await act(async () => {
        await result.current.handleToggleGrokFeedback(true);
      });

      expect(notificationsService.error).toHaveBeenCalledWith(
        'Failed to update grok feedback tweet',
      );
      expect(mockSetIsTogglingGrok).toHaveBeenLastCalledWith(false);
    });
  });

  describe('handleToggleFirstComment', () => {
    it('adds a first comment when checked', async () => {
      mockServicePost.mockResolvedValue(
        createChild('comment-1', 1, 'First comment text'),
      );
      const { result } = renderHook(() => usePostDetailThread(buildOptions()));

      await act(async () => {
        await result.current.handleToggleFirstComment(true);
      });

      expect(mockServicePost).toHaveBeenCalledWith(
        expect.objectContaining({ label: 'First comment' }),
      );
      expect(notificationsService.success).toHaveBeenCalledWith(
        'First comment added',
      );
      expect(mockSetIsTogglingFirstComment).toHaveBeenLastCalledWith(false);
    });

    it('removes the first comment when unchecked', async () => {
      const firstComment = createChild('comment-1', 3, 'First comment text');
      const { result } = renderHook(() =>
        usePostDetailThread(buildOptions({ firstCommentPost: firstComment })),
      );

      await act(async () => {
        await result.current.handleToggleFirstComment(false);
      });

      expect(mockServiceDelete).toHaveBeenCalledWith('comment-1');
      expect(mockSetChildDescription).toHaveBeenCalledWith('comment-1', '');
      expect(notificationsService.success).toHaveBeenCalledWith(
        'First comment removed',
      );
    });

    it('notifies on failure', async () => {
      mockServiceDelete.mockRejectedValue(new Error('boom'));
      const firstComment = createChild('comment-1', 3, 'First comment text');
      const { result } = renderHook(() =>
        usePostDetailThread(buildOptions({ firstCommentPost: firstComment })),
      );

      await act(async () => {
        await result.current.handleToggleFirstComment(false);
      });

      expect(notificationsService.error).toHaveBeenCalledWith(
        'Failed to update first comment',
      );
    });
  });

  describe('drag and drop', () => {
    it('tracks drag state through start and end', () => {
      const { result } = renderHook(() => usePostDetailThread(buildOptions()));

      act(() => {
        result.current.handleDragStart('child-1');
      });
      expect(result.current.draggedPostId).toBe('child-1');

      act(() => {
        result.current.setDragOverDividerIndex(2);
      });
      expect(result.current.dragOverDividerIndex).toBe(2);

      act(() => {
        result.current.handleDragEnd();
      });
      expect(result.current.draggedPostId).toBeNull();
      expect(result.current.dragOverDividerIndex).toBeNull();
    });

    it('reorders children when dropping onto a later post', async () => {
      const childA = createChild('child-a', 1);
      const childB = createChild('child-b', 2);
      const { result } = renderHook(() =>
        usePostDetailThread(buildOptions({ sortedChildren: [childA, childB] })),
      );

      act(() => {
        result.current.handleDragStart('child-a');
      });

      await act(async () => {
        await result.current.handleDrop('child-b', 2);
      });

      expect(mockServicePatch).toHaveBeenCalledWith('child-b', { order: 1 });
      expect(mockServicePatch).toHaveBeenCalledWith('child-a', { order: 2 });
      expect(notificationsService.success).toHaveBeenCalledWith(
        'Thread order updated',
      );
      expect(result.current.draggedPostId).toBeNull();
    });

    it('reorders children when dropping onto an earlier post', async () => {
      const childA = createChild('child-a', 1);
      const childB = createChild('child-b', 2);
      const { result } = renderHook(() =>
        usePostDetailThread(buildOptions({ sortedChildren: [childA, childB] })),
      );

      act(() => {
        result.current.handleDragStart('child-b');
      });

      await act(async () => {
        await result.current.handleDrop('child-a', 1);
      });

      expect(mockServicePatch).toHaveBeenCalledWith('child-a', { order: 2 });
      expect(mockServicePatch).toHaveBeenCalledWith('child-b', { order: 1 });
    });

    it('refuses to reorder grok tweets', async () => {
      const childA = createChild('child-a', 1);
      const grok = createChild('grok-1', 2, '@grok hello');
      const { result } = renderHook(() =>
        usePostDetailThread(buildOptions({ sortedChildren: [childA, grok] })),
      );

      act(() => {
        result.current.handleDragStart('grok-1');
      });

      await act(async () => {
        await result.current.handleDrop('child-a', 1);
      });

      expect(mockServicePatch).not.toHaveBeenCalled();
      expect(result.current.draggedPostId).toBeNull();
    });

    it('ignores drops without an active drag or onto itself', async () => {
      const { result } = renderHook(() => usePostDetailThread(buildOptions()));

      await act(async () => {
        await result.current.handleDrop('child-a', 1);
      });

      expect(mockServicePatch).not.toHaveBeenCalled();
    });

    it('notifies when the reorder fails', async () => {
      mockServicePatch.mockRejectedValue(new Error('boom'));
      const childA = createChild('child-a', 1);
      const childB = createChild('child-b', 2);
      const { result } = renderHook(() =>
        usePostDetailThread(buildOptions({ sortedChildren: [childA, childB] })),
      );

      act(() => {
        result.current.handleDragStart('child-a');
      });

      await act(async () => {
        await result.current.handleDrop('child-b', 2);
      });

      expect(notificationsService.error).toHaveBeenCalledWith(
        'Failed to reorder thread',
      );
    });
  });

  describe('handleDeleteChild', () => {
    it('removes the child from the post and clears its draft', () => {
      const { result } = renderHook(() => usePostDetailThread(buildOptions()));

      act(() => {
        result.current.handleDeleteChild('child-1');
      });

      const updater = mockSetPost.mock.calls[0][0] as (
        prev: IPost | null,
      ) => IPost | null;
      const previous = createPost({
        children: [createChild('child-1', 1), createChild('child-2', 2)],
      });
      const next = updater(previous);
      expect(next?.children?.map((c) => c.id)).toEqual(['child-2']);
      expect(updater(null)).toBeNull();
      expect(mockSetChildDescription).toHaveBeenCalledWith('child-1', '');
    });
  });
});
