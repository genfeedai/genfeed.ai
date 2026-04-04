'use client';

import type { ICredential, IPost } from '@genfeedai/interfaces';
import { PostCategory, PostStatus, Status } from '@genfeedai/enums';
import {
  FIRST_COMMENT_PLACEHOLDER,
  GROK_FEEDBACK_QUESTIONS,
} from '@hooks/pages/use-post-detail/use-post-detail-state';
import { useSocketSubscriptions } from '@hooks/utils/use-socket-manager/use-socket-manager';
import { PostsService } from '@services/content/posts.service';
import { logger } from '@services/core/logger.service';
import type { NotificationsService } from '@services/core/notifications.service';
import { WebSocketPaths } from '@utils/network/websocket.util';
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
  handleExpandToThread: (count: 2 | 3 | 5) => Promise<void>;
  handleDeleteChild: (childId: string) => void;
  handleDragStart: (postId: string) => void;
  handleDragEnd: () => void;
  handleDrop: (targetPostId: string, targetOrder: number) => Promise<void>;
  handleToggleGrokFeedback: (checked: boolean) => Promise<void>;
  handleToggleFirstComment: (checked: boolean) => Promise<void>;
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

  // Add to thread handler
  const handleAddToThread = useCallback(async () => {
    if (!post || !canAddThread) {
      return;
    }

    try {
      const service = await getPostsService();
      const childrenCount = sortedChildren.length;

      const lastChild =
        sortedChildren.length > 0
          ? sortedChildren[sortedChildren.length - 1]
          : null;
      const isLastGrok = lastChild?.description?.trim().startsWith('@grok');

      let newPostOrder: number;
      let grokTweetToUpdate: IPost | null = null;

      if (isLastGrok && lastChild) {
        newPostOrder = lastChild.order || childrenCount;
        grokTweetToUpdate = lastChild;
      } else {
        newPostOrder = childrenCount + 1;
      }

      const newPost = await service.post({
        credential: post.credential?.id as unknown as ICredential,
        description: "What's happening?",
        order: newPostOrder,
        parent: post.id,
        platform: post.platform,
        status: PostStatus.DRAFT,
      });

      if (grokTweetToUpdate) {
        const newGrokOrder = childrenCount + 2;
        await service.patch(grokTweetToUpdate.id, {
          order: newGrokOrder,
        });
      }

      setPost((prevPost) => {
        if (!prevPost) {
          return prevPost;
        }

        let updatedChildren = [...(prevPost.children || [])];

        if (grokTweetToUpdate) {
          updatedChildren = updatedChildren.map((child) =>
            child.id === grokTweetToUpdate?.id
              ? { ...child, order: childrenCount + 2 }
              : child,
          );
        }

        updatedChildren.push(newPost);

        return {
          ...prevPost,
          children: updatedChildren,
        };
      });

      updateChildDescriptions(newPost.id, newPost.description ?? '');

      notificationsService.success('New tweet added to thread');
    } catch (err) {
      logger.error('Failed to add to thread', err);
      notificationsService.error('Failed to add tweet to thread');
    }
  }, [
    post,
    canAddThread,
    getPostsService,
    notificationsService,
    sortedChildren,
    setPost,
    updateChildDescriptions,
  ]);

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
        const createdPosts = await service.expandToThread(post.id, count);

        const childPostIds = createdPosts
          .filter((p) => p.id !== post.id)
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
    async (checked: boolean) => {
      if (!post) {
        return;
      }

      setIsTogglingGrok(true);
      try {
        const service = await getPostsService();

        if (checked) {
          const randomQuestion =
            GROK_FEEDBACK_QUESTIONS[
              Math.floor(Math.random() * GROK_FEEDBACK_QUESTIONS.length)
            ];
          const currentChildren = sortedChildren;

          const newPost = await service.post({
            credential: post.credential?.id as unknown as ICredential,
            description: randomQuestion,
            order: currentChildren.length + 1,
            parent: post.id,
            platform: post.platform,
            status: PostStatus.DRAFT,
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
            credential: post.credential?.id as unknown as ICredential,
            description: FIRST_COMMENT_PLACEHOLDER,
            order: currentChildren.length + 1,
            parent: post.id,
            platform: post.platform,
            status: PostStatus.DRAFT,
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
        if (!prevPost || !prevPost.children) {
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
    handleAddToThread,
    handleDeleteChild,
    handleDragEnd,
    handleDragStart,
    handleDrop,
    handleExpandToThread,
    handleToggleFirstComment,
    handleToggleGrokFeedback,
    setDragOverDividerIndex,
  };
}
