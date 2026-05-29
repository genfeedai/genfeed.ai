import {
  type PostModalSchema,
  postModalSchema,
} from '@genfeedai/client/schemas';
import { ModalEnum, Platform, PostStatus } from '@genfeedai/enums';
import { getBrowserTimezone } from '@genfeedai/helpers/formatting/timezone/timezone.helper';
import { useCrudModal } from '@genfeedai/hooks/ui/use-crud-modal/use-crud-modal';
import { useModalAutoOpen } from '@genfeedai/hooks/ui/use-modal-auto-open/use-modal-auto-open';
import type { ICredential, IIngredient, IPost } from '@genfeedai/interfaces';
import type { ModalPostProps } from '@genfeedai/props/modals/modal.props';
import { PostsService } from '@genfeedai/services/content/posts.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import Modal from '@ui/modals/modal/Modal';
import {
  DEFAULT_CHAR_LIMIT,
  PLATFORM_CHAR_LIMITS,
} from '@ui-constants/platform-char-limit.constant';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import ModalPostSimpleActions from './ModalPostSimpleActions';
import ModalPostSimpleFields from './ModalPostSimpleFields';
import ModalPostSimpleHeader from './ModalPostSimpleHeader';

const EMPTY_ARRAY: never[] = [];

export default function ModalPost({
  post,
  ingredient,
  credential,
  credentials = EMPTY_ARRAY,
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
        <ModalPostSimpleHeader
          title={modalTitle}
          description={modalDescription}
        />

        <ModalPostSimpleFields
          form={form}
          credentials={credentials}
          isEditMode={isEditMode}
          isSubmitting={isSubmitting}
          selectedPlatform={selectedPlatform}
          charLimit={charLimit}
          currentLength={currentLength}
          isOverLimit={isOverLimit}
          isTitleRequired={isTitleRequired}
          isTitleError={isTitleError}
          hasIngredients={hasIngredients}
          browserTimezone={browserTimezone}
          onCredentialSelect={handleCredentialSelect}
        />

        <ModalPostSimpleActions
          isSubmitting={isSubmitting}
          isOverLimit={isOverLimit}
          isTitleError={isTitleError}
          isFormValid={form.formState.isValid}
          isEditMode={isEditMode}
          isThreadReply={isThreadReply}
          showViewDetailsButton={showViewDetailsButton}
          onViewDetails={onViewDetails}
          onViewDetailsClick={handleViewDetails}
          onCancel={handleCancel}
        />
      </form>
    </Modal>
  );
}
