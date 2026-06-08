import {
  type ThreadModalSchema,
  threadModalSchema,
} from '@genfeedai/client/schemas';
import {
  AlertCategory,
  ButtonVariant,
  ModalEnum,
  PostStatus,
} from '@genfeedai/enums';
import { getBrowserTimezone } from '@genfeedai/helpers/formatting/timezone/timezone.helper';
import {
  hasFormErrors,
  parseFormErrors,
} from '@genfeedai/helpers/ui/form-error/form-error.helper';
import { closeModal as closeModalHelper } from '@genfeedai/helpers/ui/modal/modal.helper';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { useFocusFirstInput } from '@genfeedai/hooks/ui/use-focus-first-input/use-focus-first-input';
import { useFormSubmitWithState } from '@genfeedai/hooks/utils/use-form-submit/use-form-submit';
import type { ModalCreateThreadProps } from '@genfeedai/props/modals/modal.props';
import { PostsService } from '@genfeedai/services/content/posts.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import Alert from '@ui/feedback/alert/Alert';
import ModalActions from '@ui/modals/actions/ModalActions';
import ModalCreateThreadPostsList from '@ui/modals/content/create-thread/ModalCreateThreadPostsList';
import ModalCreateThreadPreview from '@ui/modals/content/create-thread/ModalCreateThreadPreview';
import ModalCreateThreadSettings from '@ui/modals/content/create-thread/ModalCreateThreadSettings';
import Modal from '@ui/modals/modal/Modal';
import Tabs from '@ui/navigation/tabs/Tabs';
import { Button } from '@ui/primitives/button';
import { PLATFORM_CHAR_LIMITS } from '@ui-constants/platform-char-limit.constant';
import { useEffect, useMemo, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';

const EMPTY_ARRAY: never[] = [];

export default function ModalCreateThread({
  ingredient,
  credential,
  credentials = EMPTY_ARRAY,
  onConfirm,
  onClose,
}: ModalCreateThreadProps) {
  const getPostsService = useAuthedService((token: string) =>
    PostsService.getInstance(token),
  );

  const notificationsService = NotificationsService.getInstance();

  // Get browser timezone for consistent date display
  const browserTimezone = useMemo(() => getBrowserTimezone(), []);
  const formRef = useFocusFirstInput<HTMLFormElement>();
  const [activeTab, setActiveTab] = useState<'compose' | 'preview'>('compose');

  const form = useForm<ThreadModalSchema>({
    defaultValues: {
      credential: credential?.id,
      globalTitle: '',
      ingredient: ingredient?.id,
      posts: [{ description: '' }, { description: '' }],
      scheduledDate: '',
      status: PostStatus.SCHEDULED,
    },
    mode: 'onChange',
    resolver: standardSchemaResolver(threadModalSchema),
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'posts',
  });

  useEffect(() => {
    if (credential?.id) {
      form.setValue('credential', credential.id);
    }

    if (ingredient?.id) {
      form.setValue('ingredient', ingredient.id);
    }
  }, [ingredient, credential, form]);

  const closeModal = (isSuccess: boolean = false) => {
    closeModalHelper(ModalEnum.THREAD_CREATE);
    form.reset();

    if (isSuccess) {
      onConfirm?.();
    }
    onClose?.();
  };

  const handleSubmit = async (data: ThreadModalSchema) => {
    try {
      const service = await getPostsService();

      const threadPosts = data.posts.map((post, index) => ({
        credential: data.credential,
        description: post.description.trim(),
        ingredient: data.ingredient,
        label: data.globalTitle || `Thread ${index + 1}/${data.posts.length}`,
        scheduledDate: data.scheduledDate,
        status: data.status as PostStatus,
      }));

      await service.createThread({ posts: threadPosts });

      notificationsService.success(
        `Thread created with ${data.posts.length} posts`,
      );
      logger.info('POST /posts/thread success');

      closeModal(true);
    } catch (error) {
      logger.error('Thread creation failed', error);
      notificationsService.error('Failed to create thread');
    }
  };

  const submitHandler = async () => {
    await form.handleSubmit(handleSubmit)();
  };

  const { isSubmitting, onSubmit } = useFormSubmitWithState(submitHandler);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (!isSubmitting) {
        submitHandler();
      }
    }
  };

  const selectedPlatform = credentials.find(
    (c) => c.id === form.watch('credential'),
  )?.platform;

  const charLimit = selectedPlatform
    ? PLATFORM_CHAR_LIMITS[selectedPlatform] || 280
    : 280;

  const credentialOptions = credentials.map((cred) => ({
    label: `${cred.platform} - ${cred.label || cred.externalHandle || 'Untitled'}`,
    value: cred.id,
  }));

  const addPost = () => {
    append({ description: '' });
  };

  const removePost = (index: number) => {
    if (fields.length > 1) {
      remove(index);
    }
  };

  return (
    <Modal id={ModalEnum.THREAD_CREATE}>
      <form ref={formRef} onSubmit={onSubmit} className="space-y-6">
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold">Create Thread</h2>
          <p className="text-foreground/70 text-sm">
            Create multiple posts that will be linked together as a thread
          </p>
        </div>

        {/* Tabs */}
        <Tabs
          activeTab={activeTab}
          fullWidth={false}
          items={[
            { id: 'compose', label: 'Compose' },
            { id: 'preview', label: `Preview (${fields.length})` },
          ]}
          onTabChange={(tab) => setActiveTab(tab as 'compose' | 'preview')}
          variant="segmented"
        />

        {hasFormErrors(form.formState.errors) && (
          <Alert type={AlertCategory.ERROR}>
            <div className="space-y-1">
              {parseFormErrors(form.formState.errors).map((error) => (
                <div key={error}>{error}</div>
              ))}
            </div>
          </Alert>
        )}

        {activeTab === 'compose' && (
          <div className="space-y-4">
            <ModalCreateThreadSettings
              form={form}
              credentials={credentials}
              credentialOptions={credentialOptions}
              browserTimezone={browserTimezone}
            />

            <ModalCreateThreadPostsList
              form={form}
              fields={fields}
              charLimit={charLimit}
              onAddPost={addPost}
              onRemovePost={removePost}
              onKeyDown={handleKeyDown}
            />
          </div>
        )}

        {activeTab === 'preview' && (
          <ModalCreateThreadPreview
            fields={fields}
            form={form}
            charLimit={charLimit}
          />
        )}

        <ModalActions>
          <Button
            type="button"
            label="Cancel"
            variant={ButtonVariant.SECONDARY}
            onClick={() => closeModal(false)}
            isDisabled={isSubmitting}
          />
          <Button
            type="submit"
            label={
              isSubmitting
                ? 'Creating Thread…'
                : `Create Thread (${fields.length} posts)`
            }
            variant={ButtonVariant.DEFAULT}
            isDisabled={isSubmitting}
          />
        </ModalActions>
      </form>
    </Modal>
  );
}
