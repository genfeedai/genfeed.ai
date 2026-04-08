import {
  type ThreadModalSchema,
  threadModalSchema,
} from '@genfeedai/client/schemas';
import {
  AlertCategory,
  ButtonSize,
  ButtonVariant,
  ComponentSize,
  ModalEnum,
  PostStatus,
} from '@genfeedai/enums';
import { getPostStatusOptions } from '@helpers/content/posts.helper';
import { getBrowserTimezone } from '@helpers/formatting/timezone/timezone.helper';
import {
  hasFormErrors,
  parseFormErrors,
} from '@helpers/ui/form-error/form-error.helper';
import { closeModal as closeModalHelper } from '@helpers/ui/modal/modal.helper';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useFocusFirstInput } from '@hooks/ui/use-focus-first-input/use-focus-first-input';
import { useFormSubmitWithState } from '@hooks/utils/use-form-submit/use-form-submit';
import type { ModalCreateThreadProps } from '@props/modals/modal.props';
import { PostsService } from '@services/content/posts.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Badge from '@ui/display/badge/Badge';
import Alert from '@ui/feedback/alert/Alert';
import FormDateTimePicker from '@ui/forms/pickers/date-time-picker/form-date-time-picker/FormDateTimePicker';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import Tabs from '@ui/navigation/tabs/Tabs';
import { Button } from '@ui/primitives/button';
import FormControl from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { SelectField } from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { PLATFORM_CHAR_LIMITS } from '@ui-constants/misc.constant';
import { useEffect, useMemo, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { HiPlus, HiTrash } from 'react-icons/hi2';

export default function ModalCreateThread({
  ingredient,
  credential,
  credentials = [],
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
          <h2 className="text-2xl font-bold">Create Thread</h2>
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
              {parseFormErrors(form.formState.errors).map((error, index) => (
                <div key={index}>{error}</div>
              ))}
            </div>
          </Alert>
        )}

        {activeTab === 'compose' && (
          <div className="space-y-4">
            {/* Global Settings */}
            <div className="border border-white/[0.08] p-4 space-y-4">
              <h3 className="font-semibold">Thread Settings</h3>

              {credentials.length > 0 && (
                <FormControl
                  label="Platform Account"
                  error={form.formState.errors.credential?.message}
                >
                  <SelectField
                    name="credential"
                    control={form.control}
                    placeholder="Select platform account"
                  >
                    {credentialOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </SelectField>
                </FormControl>
              )}

              <FormControl label="Thread Title (Optional)">
                <Input
                  name="globalTitle"
                  control={form.control}
                  placeholder="Optional title for all posts in thread"
                />
              </FormControl>

              <div className="grid grid-cols-2 gap-4">
                <FormControl
                  label="Scheduled Date"
                  error={form.formState.errors.scheduledDate?.message}
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
                  <SelectField name="status" control={form.control}>
                    {getPostStatusOptions().map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </SelectField>
                </FormControl>
              </div>
            </div>

            {/* Thread Posts */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Thread Posts</h3>
                <Button
                  type="button"
                  label="Add Post"
                  icon={<HiPlus className="h-4 w-4" />}
                  variant={ButtonVariant.DEFAULT}
                  size={ButtonSize.SM}
                  onClick={addPost}
                />
              </div>

              {fields.map((field, index) => {
                const currentLength =
                  form.watch(`posts.${index}.description`)?.length || 0;
                const isOverLimit = currentLength > charLimit;

                return (
                  <div
                    key={field.id}
                    className="border border-white/[0.08] p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">
                        Post {index + 1}
                      </span>
                      {fields.length > 1 && (
                        <Button
                          type="button"
                          label="Remove"
                          icon={<HiTrash className="h-4 w-4" />}
                          variant={ButtonVariant.GHOST}
                          size={ButtonSize.XS}
                          className="text-error"
                          onClick={() => removePost(index)}
                        />
                      )}
                    </div>

                    <FormControl
                      label={
                        <div className="flex items-center justify-between w-full">
                          <span>Content</span>
                          <span
                            className={`text-xs ${isOverLimit ? 'text-error' : 'text-foreground/60'}`}
                          >
                            {currentLength} / {charLimit}
                          </span>
                        </div>
                      }
                      error={
                        form.formState.errors.posts?.[index]?.description
                          ?.message
                      }
                    >
                      <Textarea
                        name={`posts.${index}.description`}
                        register={form.register(`posts.${index}.description`)}
                        placeholder={`Enter content for post ${index + 1}`}
                        onKeyDown={handleKeyDown}
                      />
                    </FormControl>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'preview' && (
          <div className="space-y-4">
            <h3 className="font-semibold">Thread Preview</h3>
            <div className="space-y-3">
              {fields.map((field, index) => {
                const content = form.watch(`posts.${index}.description`);
                const charCount = content?.length || 0;
                const isOverLimit = charCount > charLimit;

                return (
                  <div
                    key={field.id}
                    className="border border-white/[0.08] p-4 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="primary" size={ComponentSize.SM}>
                          {index + 1}/{fields.length}
                        </Badge>
                        {index === 0 && (
                          <Badge variant="ghost" size={ComponentSize.SM}>
                            Root
                          </Badge>
                        )}
                        {index > 0 && (
                          <Badge variant="ghost" size={ComponentSize.SM}>
                            Reply
                          </Badge>
                        )}
                      </div>
                      <span
                        className={`text-xs ${isOverLimit ? 'text-error' : 'text-foreground/60'}`}
                      >
                        {charCount}/{charLimit}
                      </span>
                    </div>
                    <div className="text-sm">
                      {content || (
                        <span className="text-foreground/40 italic">
                          No content yet...
                        </span>
                      )}
                    </div>
                    {index < fields.length - 1 && (
                      <div className="flex items-center gap-2 text-xs text-foreground/60">
                        <div className="h-4 w-px bg-muted" />
                        <span>Continues to post {index + 2}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
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
                ? 'Creating Thread...'
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
