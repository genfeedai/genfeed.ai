'use client';

import { PostStatus } from '@genfeedai/enums';
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
  label: '',
  scheduledDate: '',
  status: PostStatus.SCHEDULED,
};

function createFormState(post: Post): PostEditorFormState {
  return {
    description: post.description || '',
    label: post.label || '',
    scheduledDate: post.scheduledDate
      ? new Date(post.scheduledDate).toISOString()
      : '',
    status: (post.status as PostStatus) || PostStatus.SCHEDULED,
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
    await form.handleSubmit(async (values: PostEditorFormState) => {
      setIsSaving(true);

      try {
        const service = await getPostsService();
        const updated = await service.patch(postId, {
          description: values.description.trim(),
          label: values.label.trim(),
          scheduledDate: values.scheduledDate,
          status: values.status,
        });

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
  }, [form, getPostsService, notificationsService, postId, reset]);

  return {
    form,
    handleSave,
    isDirty: form.formState.isDirty,
    isLoading,
    isSaving,
    post,
  };
}
