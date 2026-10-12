'use client';

import {
  PostCategory,
  PostVisibility,
  Status,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type { IPost } from '@genfeedai/contracts/interfaces';
import type { PostsService } from '@genfeedai/services/content/posts.service';
import { logger } from '@genfeedai/services/core/logger.service';
import type { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { WebSocketPaths } from '@genfeedai/utils/network/websocket.util';
import {
  FIRST_COMMENT_PLACEHOLDER,
  GROK_FEEDBACK_QUESTIONS,
} from '@hooks/pages/use-post-detail/use-post-detail-state';
import { useSocketSubscriptions } from '@hooks/utils/use-socket-manager/use-socket-manager';
import { useCallback, useEffect, useMemo, useState } from 'react';

export interface UsePostDetailThreadOptions {
  post: IPost | null;
  setPost: React.Dispatch<React.SetStateAction<IPost | null>>;
  sortedChildren: IPost[];
  canAddThread: boolean;
  isLastChildGrokTweet: boolean;
  firstCommentPost: IPost | null;
  getPostsService: () => Promise<PostsService>;
  notificationsService: NotificationsService;
  fetchPost: (isRefresh?: boolean) => Promise<void>;
  updateDescriptionRefs: (refPostId: string, description: string) => void;
  updateLabelRefs: (refPostId: string, label: string) => void;
  setChildDescription: (childId: string, value: string) => void;
  isExpandingToThread: boolean;
  setIsExpandingToThread: React.Dispatch<React.SetStateAction<boolean>>;
  generatingChildPostIds: Set<string>;
  setGeneratingChildPostIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  hasInitiatedExpansionRef: React.RefObject<boolean>;
  setIsTogglingGrok: React.Dispatch<React.SetStateAction<boolean>>;
  setIsTogglingFirstComment: React.Dispatch<React.SetStateAction<boolean>>;
}

export interface UsePostDetailThreadReturn {
  // Drag state
  draggedPostId: string | null;
  dragOverDividerIndex: number | null;
  setDragOverDividerIndex: (index: number | null) => void;

  // Handlers
  handleAddToThread: () => Promise<void>;
  handleAddThreadPosts: (descriptions: string[]) => Promise<void>;
  handleSetGrokQuestion: (question: string) => Promise<void>;
  handleExpandToThread: (count: 2 | 3 | 5) => Promise<void>;
  handleDeleteChild: (childId: string) => void;
  handleDragStart: (postId: string) => void;
  handleDragEnd: () => void;
  handleDrop: (targetPostId: string, targetOrder: number) => Promise<void>;
  handleToggleGrokFeedback: (
    checked: boolean,
    question?: string,
  ) => Promise<void>;
  handleToggleFirstComment: (checked: boolean) => Promise<void>;
}

function requirePostId(post: IPost): string {
  if (typeof post.id !== 'string' || post.id.length === 0) {
    throw new Error('Post is missing an id');
  }
  return post.id;
}

function requireCredentialId(post: IPost): string {
  const credentialId =
    typeof post.credentialId === 'string' && post.credentialId.length > 0
      ? post.credentialId
      : post.credential?.id;
  if (!credentialId) {
    throw new Error('Select a publishing account before adding a thread post.');
  }
  return credentialId;
}

export function usePostDetailThread({
  post,
  setPost,
  sortedChildren,
  canAddThread,
  isLastChildGrokTweet,
  firstCommentPost,
  getPostsService,
  notificationsService,
  fetchPost,
  updateDescriptionRefs,
  updateLabelRefs,
  setChildDescription,
  isExpandingToThread,
  setIsExpandingToThread,
  generatingChildPostIds,
  setGeneratingChildPostIds,
  hasInitiatedExpansionRef,
  setIsTogglingGrok,
  setIsTogglingFirstComment,
}: UsePostDetailThreadOptions): UsePostDetailThreadReturn {
  const [draggedPostId, setDraggedPostId] = useState<string | null>(null);
  const [dragOverDividerIndex, setDragOverDividerIndex] = useState<
    number | null
  >(null);

  // Helper to update child descriptions map
  const updateChildDescriptions = useCallback(
    (childId: string, description: string) => {
      setChildDescription(childId, description);
    },
    [setChildDescription],
  );

  // Adds replies before a closing @grok post, which stays last. Replies saved
  // before a failure are still reconciled into local state, and the failure is
  // rethrown so callers can keep what the user was adding.
  const addReplies = useCallback(
    async (descriptions: string[], successMessage: string) => {
      if (!post || !canAddThread || descriptions.length === 0) {
        return;
      }

      const lastChild = sortedChildren.at(-1) ?? null;
      const grokTweet = lastChild?.description?.trim().startsWith('@grok')
        ? lastChild
        : null;
      const firstOrder = grokTweet
        ? grokTweet.order || sortedChildren.length
        : sortedChildren.length + 1;
      const created: IPost[] = [];
      let failure: unknown = null;

      try {
        // Validate before the first write so a bad post never half-saves.
        const credentialId = requireCredentialId(post);
        const parentId = requirePostId(post);
        const service = await getPostsService();

        for (const [offset, description] of descriptions.entries()) {
          created.push(
            await service.post({
              credentialId,
              description,
              ingredients: [],
              label: 'Thread reply',
              order: firstOrder + offset,
              parentId,
              targetExecutionState: TargetExecutionState.DRAFT,
              visibility: post.visibility ?? PostVisibility.PUBLIC,
            }),
          );
        }
      } catch (err) {
        failure = err;
      }

      if (created.length > 0) {
        const grokOrder = firstOrder + created.length;
        try {
          if (grokTweet) {
            const service = await getPostsService();
            await service.patch(grokTweet.id, { order: grokOrder });
          }
        } catch (err) {
          failure ??= err;
        }

        setPost((prevPost) => {
          if (!prevPost) {
            return prevPost;
          }
          const children = prevPost.children || [];
          const others = children.filter((child) => child.id !== grokTweet?.id);
          const grok = children.find((child) => child.id === grokTweet?.id);
          return {
            ...prevPost,
            children: [
              ...others,
              ...created,
              ...(grok ? [{ ...grok, order: grokOrder }] : []),
            ],
          };
        });

        for (const reply of created) {
          updateChildDescriptions(reply.id, reply.description ?? '');
        }
      }

      if (failure) {
        logger.error('Failed to add to thread', failure);
        notificationsService.error('Failed to add to the thread');
        throw failure;
      }

      notificationsService.success(successMessage);
    },
    [
      post,
      canAddThread,
      getPostsService,
      notificationsService,
      sortedChildren,
      setPost,
      updateChildDescriptions,
    ],
  );

  // The add button is fire-and-forget: the failure is already reported.
  const handleAddToThread = useCallback(async () => {
    try {
      await addReplies(["What's happening?"], 'New post added to thread');
    } catch {
      // Reported by addReplies.
    }
  }, [addReplies]);

  const handleAddThreadPosts = useCallback(
    (descriptions: string[]) =>
      addReplies(
        descriptions,
        descriptions.length === 1
          ? 'Added 1 post to the thread'
          : `Added ${descriptions.length} posts to the thread`,
      ),
    [addReplies],
  );

  // Expand post to thread handler
  const handleExpandToThread = useCallback(
    async (count: 2 | 3 | 5) => {
      if (!post) {
        return;
      }

      hasInitiatedExpansionRef.current = false;
      setIsExpandingToThread(true);

      try {
        const service = await getPostsService();
        const createdPosts = await service.expandToThread(
          requirePostId(post),
          count,
        );

        const postId = requirePostId(post);
        const childPostIds = createdPosts
          .filter((p) => p.id !== postId)
          .map((p) => p.id);

        setGeneratingChildPostIds(new Set(childPostIds));
        hasInitiatedExpansionRef.current = true;

        await fetchPost(true);

        notificationsService.success(
          `Expanding post to ${count}-tweet thread...`,
        );
      } catch (err) {
        logger.error('Failed to expand to thread', err);
        notificationsService.error('Failed to expand post to thread');
        setIsExpandingToThread(false);
        setGeneratingChildPostIds(new Set());
        hasInitiatedExpansionRef.current = false;
      }
    },
    [
      post,
      getPostsService,
      fetchPost,
      notificationsService,
      setIsExpandingToThread,
      setGeneratingChildPostIds,
      hasInitiatedExpansionRef,
    ],
  );

  // WebSocket handler for child post updates during thread expansion
  const handleChildPostUpdate = useCallback(
    (childPostId: string) =>
      (data: { status: Status; result?: IPost; error?: string }) => {
        logger.debug('Child post WebSocket update received', {
          childPostId,
          data,
        });

        if (data.status === Status.COMPLETED && data.result) {
          const updatedPost = data.result;

          setPost((prevPost) => {
            if (!prevPost) {
              return prevPost;
            }

            const updatedChildren = (prevPost.children || []).map((child) =>
              child.id === childPostId ? updatedPost : child,
            );

            return {
              ...prevPost,
              children: updatedChildren,
            };
          });

          updateChildDescriptions(childPostId, updatedPost.description ?? '');
          updateDescriptionRefs(childPostId, updatedPost.description ?? '');
          updateLabelRefs(childPostId, updatedPost.label ?? '');

          setGeneratingChildPostIds((prev) => {
            const updated = new Set(prev);
            updated.delete(childPostId);
            return updated;
          });

          logger.debug(`Child post ${childPostId} generation completed`);
        } else if (data.status === Status.FAILED) {
          logger.error(
            `Child post ${childPostId} generation failed`,
            data.error,
          );

          setGeneratingChildPostIds((prev) => {
            const updated = new Set(prev);
            updated.delete(childPostId);
            return updated;
          });

          notificationsService.error(
            data.error || `Failed to generate thread post ${childPostId}`,
          );
        }
      },
    [
      updateDescriptionRefs,
      updateLabelRefs,
      notificationsService,
      setPost,
      updateChildDescriptions,
      setGeneratingChildPostIds,
    ],
  );

  // Create WebSocket subscriptions for generating child posts
  const wsSubscriptions = useMemo(() => {
    if (generatingChildPostIds.size === 0) {
      return [];
    }

    return Array.from(generatingChildPostIds).map((childPostId) => ({
      event: WebSocketPaths.publication(childPostId),
      handler: handleChildPostUpdate(childPostId),
    }));
  }, [generatingChildPostIds, handleChildPostUpdate]);

  useSocketSubscriptions(wsSubscriptions);

  // Clear expanding state when all child posts are complete
  useEffect(() => {
    if (
      isExpandingToThread &&
      generatingChildPostIds.size === 0 &&
      hasInitiatedExpansionRef.current
    ) {
      setIsExpandingToThread(false);
      hasInitiatedExpansionRef.current = false;
      notificationsService.success('Thread expansion completed');
    }
  }, [
    isExpandingToThread,
    generatingChildPostIds.size,
    notificationsService,
    setIsExpandingToThread,
    hasInitiatedExpansionRef,
  ]);

  // Toggle grok feedback handler
  const handleToggleGrokFeedback = useCallback(
    async (checked: boolean, question?: string) => {
      if (!post) {
        return;
      }

      setIsTogglingGrok(true);
      try {
        const service = await getPostsService();

        if (checked) {
          const randomQuestion =
            question ??
            GROK_FEEDBACK_QUESTIONS[
              Math.floor(Math.random() * GROK_FEEDBACK_QUESTIONS.length)
            ];
          const currentChildren = sortedChildren;

          const newPost = await service.post({
            credentialId: requireCredentialId(post),
            description: randomQuestion,
            ingredients: [],
            label: 'Grok feedback request',
            order: currentChildren.length + 1,
            parentId: requirePostId(post),
            targetExecutionState: TargetExecutionState.DRAFT,
            visibility: post.visibility ?? PostVisibility.PUBLIC,
          });

          setPost((prevPost) => {
            if (!prevPost) {
              return prevPost;
            }
            return {
              ...prevPost,
              children: [...(prevPost.children || []), newPost],
            };
          });

          updateChildDescriptions(newPost.id, newPost.description ?? '');

          notificationsService.success('Grok feedback request tweet added');
        } else {
          if (isLastChildGrokTweet && sortedChildren.length > 0) {
            const lastChild = sortedChildren[sortedChildren.length - 1];
            await service.delete(lastChild.id);

            setPost((prevPost) => {
              if (!prevPost) {
                return prevPost;
              }
              return {
                ...prevPost,
                children:
                  prevPost.children?.filter((c) => c.id !== lastChild.id) || [],
              };
            });

            // Remove from child descriptions via setter
            setChildDescription(lastChild.id, '');

            notificationsService.success('Grok feedback request tweet removed');
          }
        }
      } catch (err) {
        logger.error('Failed to toggle grok feedback tweet', err);
        notificationsService.error('Failed to update grok feedback tweet');
      } finally {
        setIsTogglingGrok(false);
      }
    },
    [
      post,
      getPostsService,
      notificationsService,
      isLastChildGrokTweet,
      sortedChildren,
      setPost,
      updateChildDescriptions,
      setChildDescription,
      setIsTogglingGrok,
    ],
  );

  // Toggle first comment handler
  const handleSetGrokQuestion = useCallback(
    async (question: string) => {
      const grokTweet = isLastChildGrokTweet ? sortedChildren.at(-1) : null;
      if (!grokTweet) {
        return;
      }

      try {
        const service = await getPostsService();
        await service.patch(grokTweet.id, { description: question });
        setPost((prevPost) =>
          prevPost
            ? {
                ...prevPost,
                children: (prevPost.children || []).map((child) =>
                  child.id === grokTweet.id
                    ? { ...child, description: question }
                    : child,
                ),
              }
            : prevPost,
        );
        updateDescriptionRefs(grokTweet.id, question);
        updateChildDescriptions(grokTweet.id, question);
      } catch (err) {
        logger.error('Failed to change the @grok question', err);
        notificationsService.error('Failed to change the @grok question');
      }
    },
    [
      isLastChildGrokTweet,
      sortedChildren,
      getPostsService,
      setPost,
      updateDescriptionRefs,
      updateChildDescriptions,
      notificationsService,
    ],
  );

  const handleToggleFirstComment = useCallback(
    async (checked: boolean) => {
      if (!post) {
        return;
      }

      setIsTogglingFirstComment(true);
      try {
        const service = await getPostsService();

        if (checked) {
          const currentChildren = sortedChildren;

          const newPost = await service.post({
            category: PostCategory.TEXT,
            credentialId: requireCredentialId(post),
            description: FIRST_COMMENT_PLACEHOLDER,
            ingredients: [],
            label: 'First comment',
            order: currentChildren.length + 1,
            parentId: requirePostId(post),
            targetExecutionState: TargetExecutionState.DRAFT,
            visibility: post.visibility ?? PostVisibility.PUBLIC,
          });

          setPost((prevPost) => {
            if (!prevPost) {
              return prevPost;
            }
            return {
              ...prevPost,
              children: [...(prevPost.children || []), newPost],
            };
          });

          updateChildDescriptions(newPost.id, newPost.description ?? '');

          notificationsService.success('First comment added');
        } else {
          if (firstCommentPost) {
            await service.delete(firstCommentPost.id);

            setPost((prevPost) => {
              if (!prevPost) {
                return prevPost;
              }
              return {
                ...prevPost,
                children:
                  prevPost.children?.filter(
                    (c) => c.id !== firstCommentPost.id,
                  ) || [],
              };
            });

            setChildDescription(firstCommentPost.id, '');

            notificationsService.success('First comment removed');
          }
        }
      } catch (err) {
        logger.error('Failed to toggle first comment', err);
        notificationsService.error('Failed to update first comment');
      } finally {
        setIsTogglingFirstComment(false);
      }
    },
    [
      post,
      getPostsService,
      notificationsService,
      firstCommentPost,
      sortedChildren,
      setPost,
      updateChildDescriptions,
      setChildDescription,
      setIsTogglingFirstComment,
    ],
  );

  // Drag handlers
  const handleDragStart = useCallback((dragPostId: string) => {
    setDraggedPostId(dragPostId);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedPostId(null);
    setDragOverDividerIndex(null);
  }, []);

  const handleDrop = useCallback(
    async (targetPostId: string, targetOrder: number) => {
      if (!draggedPostId || draggedPostId === targetPostId || !post) {
        return setDraggedPostId(null);
      }

      try {
        const service = await getPostsService();
        const allPosts = [post, ...sortedChildren];
        const draggedPost = allPosts.find((p) => p.id === draggedPostId);
        const targetPost = allPosts.find((p) => p.id === targetPostId);

        if (!draggedPost || !targetPost) {
          return setDraggedPostId(null);
        }

        const isDraggedGrok =
          draggedPost.description?.trim().startsWith('@grok') ?? false;
        const isTargetGrok =
          targetPost.description?.trim().startsWith('@grok') ?? false;

        if (isDraggedGrok || isTargetGrok) {
          return setDraggedPostId(null);
        }

        const updates: Array<{ id: string; order: number }> = [];
        const draggedIndex = allPosts.findIndex((p) => p.id === draggedPostId);
        const targetIndex = allPosts.findIndex((p) => p.id === targetPostId);

        if (draggedIndex < targetIndex) {
          for (let i = draggedIndex + 1; i <= targetIndex; i++) {
            if (allPosts[i].id !== draggedPostId) {
              updates.push({
                id: allPosts[i].id,
                order: (allPosts[i].order || i) - 1,
              });
            }
          }
          updates.push({ id: draggedPostId, order: targetOrder });
        } else {
          for (let i = targetIndex; i < draggedIndex; i++) {
            if (allPosts[i].id !== draggedPostId) {
              updates.push({
                id: allPosts[i].id,
                order: (allPosts[i].order || i) + 1,
              });
            }
          }
          updates.push({ id: draggedPostId, order: targetOrder });
        }

        const updatedPosts = await Promise.all(
          updates.map((update) =>
            service.patch(update.id, { order: update.order }),
          ),
        );

        setPost((prevPost) => {
          if (!prevPost) {
            return prevPost;
          }
          const updatedChildren = (prevPost.children || []).map((child) => {
            const update = updatedPosts.find((p) => p.id === child.id);
            return update || child;
          });
          return {
            ...prevPost,
            children: updatedChildren,
          };
        });

        notificationsService.success('Thread order updated');
      } catch (err) {
        logger.error('Failed to reorder thread', err);
        notificationsService.error('Failed to reorder thread');
      } finally {
        setDraggedPostId(null);
        setDragOverDividerIndex(null);
      }
    },
    [
      draggedPostId,
      post,
      getPostsService,
      notificationsService,
      sortedChildren,
      setPost,
    ],
  );

  // Delete child handler
  const handleDeleteChild = useCallback(
    (childId: string) => {
      setPost((prevPost) => {
        if (!prevPost?.children) {
          return prevPost;
        }
        return {
          ...prevPost,
          children: prevPost.children.filter((child) => child.id !== childId),
        };
      });
      setChildDescription(childId, '');
    },
    [setPost, setChildDescription],
  );

  return {
    draggedPostId,
    dragOverDividerIndex,
    handleAddThreadPosts,
    handleAddToThread,
    handleDeleteChild,
    handleDragEnd,
    handleDragStart,
    handleDrop,
    handleExpandToThread,
    handleSetGrokQuestion,
    handleToggleFirstComment,
    handleToggleGrokFeedback,
    setDragOverDividerIndex,
  };
}
