'use client';

import { CredentialPlatform, PostFormat, PostStatus } from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { Post } from '@models/content/post.model';
import type { PostEditorFormState } from '@props/content/artifact-editor.props';
import { PostsService } from '@services/content/posts.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useCallback, useEffect, useState } from 'react';
import { type UseFormReturn, useForm } from 'react-hook-form';

export interface UsePostEditorReturn {
  form: UseFormReturn<PostEditorFormState>;
  isDirty: boolean;
  isLoading: boolean;
  isSaving: boolean;
  post: Post | null;
  handleSave: () => Promise<void>;
}

const DEFAULT_POST_EDITOR_VALUES: PostEditorFormState = {
  description: '',
  format: PostFormat.STANDARD,
  label: '',
  scheduledDate: '',
  status: PostStatus.SCHEDULED,
  threadSegments: [],
};

function createFormState(post: Post): PostEditorFormState {
  return {
    description: post.description || '',
    format:
      post.children?.length && post.format !== PostFormat.THREAD
        ? PostFormat.THREAD
        : post.format || PostFormat.STANDARD,
    label: post.label || '',
    scheduledDate: post.scheduledDate
      ? new Date(post.scheduledDate).toISOString()
      : '',
    status: (post.status as PostStatus) || PostStatus.SCHEDULED,
    threadSegments: [...(post.children || [])]
      .sort((left, right) => (left.order || 0) - (right.order || 0))
      .map((child) => ({
        description: child.description || '',
        id: child.id,
      })),
  };
}

/**
 * Loads and edits a single social post from its own route, mirroring the
 * metadata overlay the Publish lists used to open in place.
 */
export function usePostEditor(postId: string): UsePostEditorReturn {
  const notificationsService = NotificationsService.getInstance();
  const [post, setPost] = useState<Post | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const getPostsService = useAuthedService(
    useCallback((token: string) => PostsService.getInstance(token), []),
  );

  const form = useForm<PostEditorFormState>({
    defaultValues: DEFAULT_POST_EDITOR_VALUES,
    mode: 'onChange',
  });

  const { reset } = form;

  useEffect(() => {
    const controller = new AbortController();

    async function loadPost() {
      setIsLoading(true);

      try {
        const service = await getPostsService();
        const data = await service.findOne(postId, {}, controller.signal);

        if (controller.signal.aborted) {
          return;
        }

        setPost(data);
        reset(createFormState(data));
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        logger.error('Failed to load post', error);
        notificationsService.error('Failed to load post');
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    loadPost();

    return () => controller.abort();
  }, [getPostsService, notificationsService, postId, reset]);

  const handleSave = useCallback(async () => {
    form.clearErrors(['description', 'scheduledDate', 'threadSegments']);
    const draft = form.getValues();
    const threadCredentialId = post?.credential?.id;
    const rootLimit =
      post?.platform === CredentialPlatform.TWITTER
        ? draft.format === PostFormat.LONG_FORM
          ? 25_000
          : 280
        : Number.POSITIVE_INFINITY;

    if (!draft.description.trim()) {
      form.setError('description', {
        message: 'Post content is required',
        type: 'validate',
      });
      return;
    }

    if (draft.description.length > rootLimit) {
      form.setError('description', {
        message: `Post content must be ${rootLimit.toLocaleString()} characters or fewer`,
        type: 'validate',
      });
      return;
    }

    if (draft.status === PostStatus.SCHEDULED && !draft.scheduledDate) {
      form.setError('scheduledDate', {
        message: 'Choose a scheduled date before scheduling this post',
        type: 'validate',
      });
      return;
    }

    if (draft.format === PostFormat.THREAD) {
      if (!threadCredentialId) {
        notificationsService.error(
          'Connect an X account before saving thread replies',
        );
        return;
      }

      if (draft.threadSegments.length === 0) {
        form.setError('threadSegments', {
          message: 'Add at least one reply to create a thread',
          type: 'validate',
        });
        return;
      }

      const invalidSegmentIndex = draft.threadSegments.findIndex(
        (segment) =>
          !segment.description.trim() || segment.description.length > 280,
      );
      if (invalidSegmentIndex >= 0) {
        form.setError(`threadSegments.${invalidSegmentIndex}.description`, {
          message: 'Thread replies must contain 1–280 characters',
          type: 'validate',
        });
        return;
      }
    }

    await form.handleSubmit(async (values: PostEditorFormState) => {
      setIsSaving(true);

      try {
        const service = await getPostsService();
        await service.patch(postId, {
          description: values.description.trim(),
          format: values.format,
          label: values.label.trim(),
          ...(values.scheduledDate
            ? { scheduledDate: values.scheduledDate }
            : {}),
          status: values.status,
        });

        if (values.format === PostFormat.THREAD && post) {
          if (!threadCredentialId) {
            throw new Error('X credential is required to save thread replies');
          }

          const originalChildren = post.children || [];
          const submittedIds = new Set(
            values.threadSegments.flatMap((segment) =>
              segment.id ? [segment.id] : [],
            ),
          );

          for (const child of originalChildren) {
            if (!submittedIds.has(child.id)) {
              await service.delete(child.id);
            }
          }

          for (const [index, segment] of values.threadSegments.entries()) {
            if (segment.id) {
              await service.patch(segment.id, {
                description: segment.description.trim(),
                format: PostFormat.THREAD,
              });
              continue;
            }

            await service.post(`${postId}/replies`, {
              credentialId: threadCredentialId,
              description: segment.description.trim(),
              format: PostFormat.THREAD,
              ingredients: [],
              label: `Thread ${index + 2}/${values.threadSegments.length + 1}`,
              scheduledDate: values.scheduledDate || undefined,
              status: values.status,
            });
          }
        }

        const updated = await service.findOne(postId);

        setPost(updated);
        reset(createFormState(updated));
        notificationsService.success('Post updated successfully');
      } catch (error) {
        logger.error(`PATCH /posts/${postId} failed`, error);
        notificationsService.error('Failed to update post');
      } finally {
        setIsSaving(false);
      }
    })();
  }, [form, getPostsService, notificationsService, post, postId, reset]);

  return {
    form,
    handleSave,
    isDirty: form.formState.isDirty,
    isLoading,
    isSaving,
    post,
  };
}
