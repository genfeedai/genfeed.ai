import {
  type PostModalSchema,
  postModalSchema,
} from '@genfeedai/client/schemas';
import {
  ModalEnum,
  Platform,
  PostFormat,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type { IIngredient, IPost } from '@genfeedai/contracts/interfaces';
import { getBrowserTimezone } from '@genfeedai/helpers/formatting/timezone/timezone.helper';
import { useCrudModal } from '@genfeedai/hooks/ui/use-crud-modal/use-crud-modal';
import { useModalAutoOpen } from '@genfeedai/hooks/ui/use-modal-auto-open/use-modal-auto-open';
import type { ModalPostProps } from '@genfeedai/props/modals/modal.props';
import { PostsService } from '@genfeedai/services/content/posts.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import Modal from '@ui/modals/modal/Modal';
import {
  DEFAULT_CHAR_LIMIT,
  PLATFORM_CHAR_LIMITS,
  X_LONG_FORM_CHAR_LIMIT,
} from '@ui-constants/platform-char-limit.constant';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import ModalPostSimpleActions from './ModalPostSimpleActions';
import ModalPostSimpleFields from './ModalPostSimpleFields';
import ModalPostSimpleHeader from './ModalPostSimpleHeader';

const EMPTY_ARRAY: never[] = [];

export default function ModalPost({
  post,
  ingredient,
  modalId = ModalEnum.POST,
  credential,
  credentials = EMPTY_ARRAY,
  parentPost,
  postFormat = PostFormat.STANDARD,
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
      credentialId: credential?.id || credentials[0]?.id || '',
      description: '',
      format: postFormat,
      ingredients: ingredient ? [ingredient.id] : [],
      label: '',
      parentId: parentPost?.id || '',
      scheduledDate: '',
      targetExecutionState: TargetExecutionState.DRAFT,
      visibility: PostVisibility.PUBLIC,
    }),
    [credential?.id, credentials, ingredient, parentPost?.id, postFormat],
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
        (c) => c.id === formData.credentialId,
      );
      const targetPlatform =
        selectedCredential?.platform ||
        entity?.platform ||
        entity?.credential?.platform;

      const isScheduling =
        formData.targetExecutionState === TargetExecutionState.SCHEDULED;
      if (isScheduling && !formData.scheduledDate) {
        notificationsService.error(
          'Choose a scheduled date before scheduling this post',
        );
        throw new Error('Scheduled date required for scheduled posts');
      }

      if (isScheduling && targetPlatform !== Platform.TWITTER) {
        if (!formData.ingredients || formData.ingredients.length === 0) {
          notificationsService.error(
            `${targetPlatform || 'This platform'} requires media when scheduling. Please select at least one image or video.`,
          );
          throw new Error(
            'Ingredients required when scheduling for non-Twitter platforms',
          );
        }
      }

      if (isEditMode && entity?.id) {
        const url = `PATCH /posts/${entity.id}`;
        const result = await postsService.patch(entity.id, {
          credentialId: formData.credentialId,
          description: formData.description.trim(),
          format: formData.format,
          label: formData.label?.trim() || '',
          ...(formData.scheduledDate
            ? { scheduledDate: formData.scheduledDate }
            : {}),
          targetExecutionState: formData.targetExecutionState,
          visibility: formData.visibility,
        });

        notificationsService.success('Post updated successfully');
        logger.info(`${url} success`);
        return result;
      } else {
        const url = 'POST /publishing';
        const result = await postsService.post({
          credentialId: formData.credentialId,
          description: formData.description.trim(),
          format: formData.format,
          ingredients: formData.ingredients || [],
          label: formData.label?.trim() || '',
          parentId: formData.parentId,
          ...(formData.scheduledDate
            ? { scheduledDate: formData.scheduledDate }
            : {}),
          targetExecutionState: formData.targetExecutionState,
          visibility: formData.visibility,
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

  useModalAutoOpen(modalId, {
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
    modalId,
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
      form.setValue('format', post.format || PostFormat.STANDARD);
      form.setValue(
        'scheduledDate',
        post.scheduledDate ? new Date(post.scheduledDate).toISOString() : '',
      );
      form.setValue(
        'targetExecutionState',
        post.targetExecutionState ?? TargetExecutionState.DRAFT,
      );
      form.setValue('visibility', post.visibility ?? PostVisibility.PUBLIC);
      form.setValue('credentialId', post.credential?.id ?? '');
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
    (c) => c.id === form.watch('credentialId'),
  );

  const selectedPlatform =
    selectedCredential?.platform ||
    post?.platform ||
    post?.credential?.platform;

  const charLimit =
    selectedPlatform === Platform.TWITTER &&
    form.watch('format') === PostFormat.LONG_FORM
      ? X_LONG_FORM_CHAR_LIMIT
      : selectedPlatform
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
      form.setValue('credentialId', credentialId, {
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
      description:
        postFormat === PostFormat.LONG_FORM
          ? 'Create a long X post, then refine or schedule it from the Posts library'
          : 'Create a new post to schedule for publishing',
      title:
        postFormat === PostFormat.LONG_FORM
          ? 'Create X Long Post'
          : 'Create Post',
    };
  };

  const { title: modalTitle, description: modalDescription } =
    getModalContent();

  return (
    <Modal
      id={modalId}
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
