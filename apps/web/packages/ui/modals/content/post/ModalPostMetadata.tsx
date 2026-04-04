import {
  AlertCategory,
  ButtonVariant,
  ModalEnum,
  Platform,
  PostStatus,
} from '@genfeedai/enums';
import { getPostStatusOptions } from '@helpers/content/posts.helper';
import { getBrowserTimezone } from '@helpers/formatting/timezone/timezone.helper';
import {
  hasFormErrors,
  parseFormErrors,
} from '@helpers/ui/form-error/form-error.helper';
import { closeModal as closeModalHelper } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useFocusFirstInput } from '@hooks/ui/use-focus-first-input/use-focus-first-input';
import { useModalAutoOpen } from '@hooks/ui/use-modal-auto-open/use-modal-auto-open';
import { useFormSubmitWithState } from '@hooks/utils/use-form-submit/use-form-submit';
import type { PostMetadataOverlayProps } from '@props/modals/modal.props';
import { PostsService } from '@services/content/posts.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Button from '@ui/buttons/base/Button';
import Alert from '@ui/feedback/alert/Alert';
import FormControl from '@ui/forms/base/form-control/FormControl';
import FormInput from '@ui/forms/inputs/input/form-input/FormInput';
import FormTextarea from '@ui/forms/inputs/textarea/form-textarea/FormTextarea';
import FormDateTimePicker from '@ui/forms/pickers/date-time-picker/form-date-time-picker/FormDateTimePicker';
import FormSelect from '@ui/forms/selectors/select/form-select/FormSelect';
import EntityOverlayShell from '@ui/overlays/entity/EntityOverlayShell';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';

interface PostMetadataFormValues {
  description: string;
  label: string;
  scheduledDate: string;
  status: PostStatus;
}

const DEFAULT_POST_METADATA_VALUES: PostMetadataFormValues = {
  description: '',
  label: '',
  scheduledDate: '',
  status: PostStatus.SCHEDULED,
};

export default function PostMetadataOverlay({
  post,
  onConfirm,
  onClose,
}: PostMetadataOverlayProps) {
  const formId = 'post-metadata-form';
  const getPostsService = useAuthedService((token: string) =>
    PostsService.getInstance(token),
  );

  const notificationsService = NotificationsService.getInstance();

  // Get browser timezone for consistent date display
  const browserTimezone = useMemo(() => getBrowserTimezone(), []);
  const formRef = useFocusFirstInput<HTMLFormElement>();

  const form = useForm<PostMetadataFormValues>({
    defaultValues: DEFAULT_POST_METADATA_VALUES,
    mode: 'onChange',
  });

  // Auto-open modal when post data is provided
  useModalAutoOpen(ModalEnum.POST_METADATA, {
    isOpen: Boolean(post),
  });

  // Initialize form with post data
  useEffect(() => {
    if (post) {
      form.reset({
        description: post.description || '',
        label: post.label || '',
        scheduledDate: post.scheduledDate
          ? new Date(post.scheduledDate).toISOString()
          : '',
        status: (post.status as PostStatus) || PostStatus.SCHEDULED,
      });
    }
  }, [post, form]);

  const handleSubmit = async (data: PostMetadataFormValues) => {
    if (!post?.id) {
      return;
    }

    const url = `PATCH /posts/${post.id}`;
    try {
      const service = await getPostsService();

      await service.patch(post.id, {
        description: data.description.trim(),
        label: data.label.trim(),
        scheduledDate: data.scheduledDate,
        status: data.status as PostStatus,
      });

      notificationsService.success('Post updated successfully');
      logger.info(`${url} success`);

      onConfirm?.();
      closeModalHelper(ModalEnum.POST_METADATA);
    } catch (error) {
      logger.error(`${url} failed`, error);
      notificationsService.error('Failed to update post');
    }
  };

  const submitHandler = async () => {
    await form.handleSubmit(handleSubmit)();
  };

  const { isSubmitting, onSubmit } = useFormSubmitWithState(submitHandler);

  if (!post) {
    return null;
  }

  const isYouTube = post.platform === Platform.YOUTUBE;
  const handleOverlayClose = () => {
    form.reset();
    onClose?.();
  };

  return (
    <EntityOverlayShell
      id={ModalEnum.POST_METADATA}
      title={post.label || 'Edit Post'}
      description="Update post metadata without leaving the current list context."
      width="lg"
      onClose={handleOverlayClose}
      badges={
        <>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-foreground/55">
            Post
          </span>
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-foreground/70">
            {post.platform}
          </span>
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-foreground/70">
            {post.status}
          </span>
        </>
      }
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button
            type="button"
            label="Cancel"
            variant={ButtonVariant.SECONDARY}
            onClick={() => closeModalHelper(ModalEnum.POST_METADATA)}
            isDisabled={isSubmitting}
          />
          <Button
            type="submit"
            form={formId}
            label={isSubmitting ? 'Saving...' : 'Save'}
            variant={ButtonVariant.DEFAULT}
            isDisabled={isSubmitting}
          />
        </div>
      }
    >
      <form id={formId} ref={formRef} onSubmit={onSubmit} className="space-y-6">
        <div className="space-y-4">
          <p className="text-foreground/70 text-sm">
            Update the details for this scheduled post
          </p>
        </div>

        {hasFormErrors(form.formState.errors) && (
          <Alert type={AlertCategory.ERROR}>
            <div className="space-y-1">
              {parseFormErrors(form.formState.errors).map((error, index) => (
                <div key={index}>{error}</div>
              ))}
            </div>
          </Alert>
        )}

        <div className="space-y-4">
          <FormControl
            label="Title"
            error={form.formState.errors.label?.message}
          >
            <FormInput
              name="label"
              control={form.control}
              placeholder="Enter post title"
            />
          </FormControl>

          <FormControl
            label="Description"
            error={form.formState.errors.description?.message}
          >
            <FormTextarea<PostMetadataFormValues>
              name="description"
              control={form.control}
              placeholder="Enter post description"
            />
          </FormControl>

          <FormControl
            label="Scheduled Date"
            error={form.formState.errors.scheduledDate?.message}
          >
            <FormDateTimePicker
              value={form.watch('scheduledDate')}
              timezone={browserTimezone}
              onChange={(value) =>
                form.setValue('scheduledDate', value ? value.toISOString() : '')
              }
            />
          </FormControl>

          {isYouTube && (
            <FormControl
              label="Status"
              error={form.formState.errors.status?.message}
            >
              <FormSelect name="status" control={form.control}>
                {getPostStatusOptions().map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </FormSelect>
            </FormControl>
          )}
        </div>
      </form>
    </EntityOverlayShell>
  );
}
