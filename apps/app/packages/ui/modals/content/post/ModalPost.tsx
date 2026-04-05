import type { ICredential, IIngredient, IPost } from '@genfeedai/interfaces';
import {
  type PostModalSchema,
  postModalSchema,
} from '@genfeedai/client/schemas';
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
import { useCrudModal } from '@hooks/ui/use-crud-modal/use-crud-modal';
import { useModalAutoOpen } from '@hooks/ui/use-modal-auto-open/use-modal-auto-open';
import type { ModalPostProps } from '@props/modals/modal.props';
import { PostsService } from '@services/content/posts.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Button from '@ui/buttons/base/Button';
import LazyRichTextEditor from '@ui/editors/LazyRichTextEditor';
import Alert from '@ui/feedback/alert/Alert';
import FormControl from '@ui/forms/base/form-control/FormControl';
import FormInput from '@ui/forms/inputs/input/form-input/FormInput';
import FormDateTimePicker from '@ui/forms/pickers/date-time-picker/form-date-time-picker/FormDateTimePicker';
import PlatformSelector from '@ui/forms/selectors/platform-selector/PlatformSelector';
import FormSelect from '@ui/forms/selectors/select/form-select/FormSelect';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import {
  DEFAULT_CHAR_LIMIT,
  PLATFORM_CHAR_LIMITS,
} from '@ui-constants/misc.constant';
import { useCallback, useEffect, useMemo, useRef } from 'react';

export default function ModalPost({
  post,
  ingredient,
  credential,
  credentials = [],
  parentPost,
  onConfirm,
  onClose,
  onCreated,
  showViewDetailsButton = false,
  onViewDetails,
}: ModalPostProps) {
  const notificationsService = NotificationsService.getInstance();

  // Get browser timezone for consistent date display
  const browserTimezone = useMemo(() => getBrowserTimezone(), []);

  const isEditMode = Boolean(post);
  const isThreadReply = Boolean(parentPost);

  // Refs for callbacks to prevent re-renders
  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;
  const onViewDetailsRef = useRef(onViewDetails);
  onViewDetailsRef.current = onViewDetails;
  const onCreatedRef = useRef(onCreated);
  onCreatedRef.current = onCreated;

  // Stable callback for useCrudModal
  const stableOnConfirm = useCallback(() => {
    onConfirmRef.current?.();
  }, []);

  // Stabilize defaultValues to prevent unnecessary re-renders
  const _defaultValuesKey = `${credential?.id}-${ingredient?.id}-${parentPost?.id}`;
  const defaultValues = useMemo(
    () => ({
      credential: credential?.id || '',
      description: '',
      ingredients: ingredient ? [ingredient.id] : [],
      label: '',
      parent: parentPost?.id || '',
      scheduledDate: '',
      status: PostStatus.DRAFT,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [credential?.id, ingredient, parentPost?.id],
  );
  const defaultValuesRef = useRef(defaultValues);
  defaultValuesRef.current = defaultValues;

  const customSubmitHandler = useCallback(
    async (
      service: unknown,
      entity: typeof post,
      formData: PostModalSchema,
    ) => {
      const postsService = service as PostsService;

      const selectedCredential = credentials.find(
        (c) => c.id === formData.credential,
      );

      const isScheduling = formData.status === PostStatus.SCHEDULED;
      if (isScheduling && selectedCredential?.platform !== Platform.TWITTER) {
        if (!formData.ingredients || formData.ingredients.length === 0) {
          notificationsService.error(
            `${selectedCredential?.platform || 'This platform'} requires media when scheduling. Please select at least one image or video.`,
          );
          throw new Error(
            'Ingredients required when scheduling for non-Twitter platforms',
          );
        }
      }

      if (isEditMode && entity?.id) {
        const url = `PATCH /posts/${entity.id}`;
        const result = await postsService.patch(entity.id, {
          description: formData.description.trim(),
          label: formData.label?.trim() || '',
          scheduledDate: formData.scheduledDate,
          status: formData.status as PostStatus,
        });

        notificationsService.success('Post updated successfully');
        logger.info(`${url} success`);
        return result;
      } else {
        const url = 'POST /posts';
        const result = await postsService.post({
          credential: formData.credential as unknown as ICredential,
          description: formData.description.trim(),
          ingredients: (formData.ingredients || []) as unknown as IIngredient[],
          label: formData.label?.trim() || '',
          parent: formData.parent,
          scheduledDate: formData.scheduledDate,
          status: formData.status as PostStatus,
        });

        notificationsService.success(
          isThreadReply ? 'Reply added to thread' : 'Post created successfully',
        );
        logger.info(`${url} success`);

        if (onCreatedRef.current && result?.id) {
          onCreatedRef.current(result.id);
        }

        return result;
      }
    },
    [isEditMode, isThreadReply, notificationsService, credentials],
  );

  const shouldAutoOpen = Boolean(post || ingredient || credential);
  const openKey = post?.id || ingredient?.id || credential?.id || 'new';

  useModalAutoOpen(ModalEnum.POST, {
    isOpen: shouldAutoOpen,
    openKey,
  });

  const { form, formRef, isSubmitting, onSubmit, closeModal } = useCrudModal<
    IPost,
    PostModalSchema
  >({
    customSubmitHandler,
    defaultValues,
    entity: null, // Don't auto-populate, we handle it manually
    modalId: ModalEnum.POST,
    onClose,
    onConfirm: stableOnConfirm,
    schema: postModalSchema,
    serviceFactory: (token) => PostsService.getInstance(token),
  });

  // Manually populate form when post changes (transform objects to IDs)
  useEffect(() => {
    if (post) {
      form.setValue('label', post.label || '');
      form.setValue('description', post.description || '');
      form.setValue(
        'scheduledDate',
        post.scheduledDate ? new Date(post.scheduledDate).toISOString() : '',
      );
      form.setValue('status', post.status || PostStatus.DRAFT);
      form.setValue('credential', post.credential?.id || '');
      form.setValue(
        'ingredients',
        post.ingredients?.map((ing: IIngredient) => ing.id) || [],
      );
    }
  }, [post, form]);

  // Called when Cancel button is clicked - initiates the close
  const handleCancel = useCallback(() => {
    closeModal();
  }, [closeModal]);

  // Called by Modal's onClose after modal is closed - just cleanup, don't re-close
  const handleModalClosed = useCallback(() => {
    form.reset(defaultValuesRef.current);
  }, [form]);

  const handleViewDetails = useCallback(() => {
    closeModal();
    onViewDetailsRef.current?.();
  }, [closeModal]);

  const selectedCredential = credentials.find(
    (c) => c.id === form.watch('credential'),
  );

  const selectedPlatform =
    selectedCredential?.platform || post?.credential?.platform;

  const charLimit = selectedPlatform
    ? PLATFORM_CHAR_LIMITS[selectedPlatform] || DEFAULT_CHAR_LIMIT
    : DEFAULT_CHAR_LIMIT;

  const currentLength = form.watch('description')?.length || 0;
  const isOverLimit = currentLength > charLimit;

  // YouTube requires a title
  const isTitleRequired = selectedPlatform === Platform.YOUTUBE;
  const titleValue = form.watch('label');
  const isTitleError =
    isTitleRequired && (!titleValue || titleValue.trim() === '');

  const hasIngredients =
    (post?.ingredients?.length ?? 0) > 0 ||
    (form.watch('ingredients')?.length ?? 0) > 0;

  const handleCredentialSelect = useCallback(
    (credentialId: string) => {
      form.setValue('credential', credentialId, {
        shouldDirty: true,
        shouldValidate: true,
      });
    },
    [form],
  );

  const getModalContent = () => {
    if (isEditMode) {
      return {
        description: 'Update the content and details for this post',
        title: 'Edit Post',
      };
    }
    if (isThreadReply) {
      return {
        description: 'Add a new reply to continue the thread',
        title: 'Add Thread Reply',
      };
    }
    return {
      description: 'Create a new post to schedule for publishing',
      title: 'Create Post',
    };
  };

  const { title: modalTitle, description: modalDescription } =
    getModalContent();

  return (
    <Modal
      id={ModalEnum.POST}
      modalBoxClassName="max-w-2xl"
      onClose={handleModalClosed}
    >
      <form ref={formRef} onSubmit={onSubmit} className="space-y-6">
        <div className="space-y-4">
          <h2 className="text-2xl font-bold">{modalTitle}</h2>
          <p className="text-foreground/70 text-sm">{modalDescription}</p>
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
          {!isEditMode && credentials.length > 0 && (
            <FormControl error={form.formState.errors.credential?.message}>
              <PlatformSelector
                credentials={credentials}
                selectedCredentialId={form.watch('credential')}
                onSelect={handleCredentialSelect}
                isDisabled={isSubmitting}
              />
            </FormControl>
          )}

          {selectedPlatform !== Platform.TWITTER && (
            <FormControl
              label="Title"
              error={
                isTitleError
                  ? 'Title is required for YouTube'
                  : form.formState.errors.label?.message
              }
            >
              <FormInput
                name="label"
                control={form.control}
                placeholder={
                  isTitleRequired ? 'Enter YouTube video title' : 'Optional'
                }
              />
            </FormControl>
          )}

          <FormControl
            error={form.formState.errors.description?.message}
            label={
              <div className="flex items-center justify-between w-full gap-2">
                <span>
                  {selectedPlatform === Platform.TWITTER
                    ? 'Post'
                    : 'Description'}
                </span>
                <span
                  className={`text-xs ${isOverLimit ? 'text-error' : 'text-foreground/60'}`}
                >
                  {currentLength} / {charLimit}
                </span>
              </div>
            }
          >
            <LazyRichTextEditor
              value={form.watch('description') || ''}
              onChange={(value) => {
                form.setValue('description', value, {
                  shouldDirty: true,
                  shouldValidate: true,
                });
              }}
              placeholder="Enter post caption"
              minHeight={{ desktop: 300, mobile: 200 }}
            />
          </FormControl>

          {hasIngredients && (
            <>
              <FormControl
                label="Scheduled Date (Optional)"
                error={form.formState.errors.scheduledDate?.message}
                helpText="Set when content is ready to publish"
              >
                <FormDateTimePicker
                  value={form.watch('scheduledDate')}
                  timezone={browserTimezone}
                  onChange={(value) =>
                    form.setValue(
                      'scheduledDate',
                      value ? value.toISOString() : '',
                    )
                  }
                />
              </FormControl>

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
            </>
          )}
        </div>

        <ModalActions>
          <div className="flex justify-between w-full">
            <div className="flex gap-2">
              {showViewDetailsButton && onViewDetails && (
                <Button
                  type="button"
                  label="View Details"
                  variant={ButtonVariant.OUTLINE}
                  onClick={handleViewDetails}
                  isDisabled={isSubmitting}
                />
              )}
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                label="Cancel"
                variant={ButtonVariant.SECONDARY}
                onClick={handleCancel}
                isDisabled={isSubmitting}
              />

              <Button
                type="submit"
                label={(() => {
                  if (isSubmitting) {
                    return 'Saving...';
                  }
                  if (isEditMode) {
                    return 'Save';
                  }
                  if (isThreadReply) {
                    return 'Add Reply';
                  }
                  return 'Create Post';
                })()}
                variant={ButtonVariant.DEFAULT}
                isDisabled={
                  isSubmitting ||
                  isOverLimit ||
                  isTitleError ||
                  !form.formState.isValid
                }
              />
            </div>
          </div>
        </ModalActions>
      </form>
    </Modal>
  );
}
