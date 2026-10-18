import {
  type ArticleModalSchema,
  articleModalSchema,
} from '@genfeedai/client/schemas';
import {
  AlertCategory,
  ArticleCategory,
  ButtonVariant,
  ComponentSize,
  ModalEnum,
} from '@genfeedai/contracts';
import {
  hasFormErrors,
  parseFormErrors,
} from '@genfeedai/helpers/ui/form-error/form-error.helper';
import { closeModal as closeModalHelper } from '@genfeedai/helpers/ui/modal/modal.helper';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { useFocusFirstInput } from '@genfeedai/hooks/ui/use-focus-first-input/use-focus-first-input';
import { useFormSubmitWithState } from '@genfeedai/hooks/utils/use-form-submit/use-form-submit';
import type { Article } from '@genfeedai/models/content/article.model';
import type { ModalArticleProps } from '@genfeedai/props/modals/modal.props';
import { ArticlesService } from '@genfeedai/services/content/articles.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import Alert from '@ui/feedback/alert/Alert';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import { Button } from '@ui/primitives/button';
import FormControl from '@ui/primitives/field';
import { Form } from '@ui/primitives/form';
import { Input } from '@ui/primitives/input';
import Spinner from '@ui/primitives/spinner';
import { Switch } from '@ui/primitives/switch';
import { Textarea } from '@ui/primitives/textarea';
import PromptBarComposer from '@ui/prompt-bars/components/shell/PromptBarComposer';
import PromptBarCompactSelect from '@ui/prompt-bars/components/toolbar/PromptBarCompactSelect';
import PromptBarSendButton from '@ui/prompt-bars/components/toolbar/PromptBarSendButton';
import PromptBarToolbar from '@ui/prompt-bars/components/toolbar/PromptBarToolbar';
import PromptEditor from '@ui/prompt-editor/PromptEditor';
import { type ChangeEvent, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';

const ARTICLE_COUNT_OPTIONS = [
  { label: '1 Article', value: '1' },
  { label: '2 Articles', value: '2' },
  { label: '3 Articles', value: '3' },
  { label: '4 Articles', value: '4' },
];

export default function ModalArticle({
  onConfirm,
  onCreated,
}: ModalArticleProps) {
  const getArticlesService = useAuthedService((token: string) =>
    ArticlesService.getInstance(token),
  );

  const notificationsService = NotificationsService.getInstance();
  const formRef = useFocusFirstInput<HTMLFormElement>();

  const [useAI, setUseAI] = useState(false);

  const form = useForm<ArticleModalSchema>({
    defaultValues: {
      content: '',
      count: '1',
      label: '',
      prompt: '',
    },
    mode: 'onChange',
    resolver: standardSchemaResolver(articleModalSchema),
  });

  // Trigger validation when mode changes
  useEffect(() => {
    form.trigger();
  }, [form]);

  const closeModal = (isSuccess: boolean = false) => {
    closeModalHelper(ModalEnum.ARTICLE);
    form.reset();
    setUseAI(false);

    if (isSuccess) {
      onConfirm?.(true);
    }
  };

  const handleToggleAI = (enabled: boolean) => {
    setUseAI(enabled);
    // Clear form errors when switching modes
    form.clearErrors();
    // Reset fields not in use
    if (enabled) {
      form.setValue('label', '');
      form.setValue('content', '');
    } else {
      form.setValue('prompt', '');
      form.setValue('count', '1');
    }
  };

  const submitModalArticle = async () => {
    try {
      const service = await getArticlesService();
      const formData = form.getValues();

      if (useAI) {
        if (!formData.prompt?.trim()) {
          return form.setError('prompt', {
            message: 'Please enter an article idea',
            type: 'manual',
          });
        }

        if (!formData.count) {
          return form.setError('count', {
            message: 'Please select number of articles',
            type: 'manual',
          });
        }
        const countNum = parseInt(formData.count, 10);
        if (Number.isNaN(countNum) || countNum < 1 || countNum > 4) {
          form.setError('count', {
            message: 'Please select a valid number of articles (1-4)',
            type: 'manual',
          });
          return;
        }
      } else {
        if (!formData.label?.trim()) {
          return form.setError('label', {
            message: 'Title is required',
            type: 'manual',
          });
        }

        if (!formData.content?.trim()) {
          return form.setError('content', {
            message: 'Content is required',
            type: 'manual',
          });
        }
      }

      if (useAI) {
        // AI generation mode
        const generatedArticles = await service.generateArticles({
          category: ArticleCategory.POST,
          count: parseInt(formData.count!, 10),
          prompt: formData.prompt?.trim() ?? '',
        });

        const articleIds = generatedArticles.map((article) => article.id);

        notificationsService.success(
          `Generated ${generatedArticles.length} article${generatedArticles.length > 1 ? 's' : ''} successfully`,
        );

        logger.info('POST /articles/generate success', {
          count: generatedArticles.length,
        });
        closeModal(true);

        // Call onCreated callback with array of IDs
        onCreated?.(articleIds);
      } else {
        // Manual creation mode
        const result: Article = await service.post({
          content: formData.content!,
          label: formData.label!,
          slug: formData.label?.toLowerCase().replace(/\s+/g, '-'), // Simple slug generation
          summary: formData.content?.substring(0, 200), // Use first 200 chars as summary
        });

        logger.info('POST /articles success', result);

        // Call onCreated callback with the new article ID for redirect
        closeModal(true);
        onCreated?.(result.id);
      }
    } catch (error) {
      logger.error(
        useAI ? 'POST /articles/generate failed' : 'POST /articles failed',
        error,
      );
      notificationsService.error(
        useAI ? 'Failed to generate article' : 'Failed to create article',
      );
    }
  };

  const { isSubmitting, onSubmit } = useFormSubmitWithState(() =>
    submitModalArticle(),
  );

  const processKeyDownModalArticle = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (!isSubmitting) {
        submitModalArticle();
      }
    }
  };

  const updateModalArticle = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    form.setValue(name as Parameters<typeof form.setValue>[0], value, {
      shouldValidate: true,
    });
  };

  const count = form.watch('count');
  const countNumber =
    typeof count === 'string' ? parseInt(count, 10) : count || 1;
  const generateLabel = `Generate ${countNumber} Article${countNumber > 1 ? 's' : ''}`;
  const isSubmitDisabled =
    isSubmitting ||
    (useAI
      ? !form.watch('prompt')?.trim() || !form.watch('count')
      : !form.watch('label')?.trim() || !form.watch('content')?.trim());

  // The send control and Enter in the editor go through the form so the
  // in-flight state and validation match the footer's Create button.
  const submitFromPrompt = () => {
    if (!isSubmitDisabled) {
      formRef.current?.requestSubmit();
    }
  };

  return (
    <Modal id={ModalEnum.ARTICLE} title="Create New Article">
      <Form ref={formRef} onSubmit={onSubmit}>
        {hasFormErrors(form.formState.errors) && (
          <Alert type={AlertCategory.ERROR}>
            <div className="space-y-1">
              {parseFormErrors(form.formState.errors).map((error) => (
                <div key={error}>{error}</div>
              ))}
            </div>
          </Alert>
        )}

        {useAI ? (
          <>
            {/* AI Generation Fields */}
            <PromptBarComposer
              data-testid="article-prompt-composer"
              density="compact"
              beforeBody={
                <p className="px-3.5 pt-2.5 text-2xs font-medium text-foreground/55">
                  Article Idea
                </p>
              }
            >
              <PromptEditor
                ariaLabel="Article Idea"
                isAutoFocused
                value={form.watch('prompt') ?? ''}
                isDisabled={isSubmitting}
                placeholder="Describe what you want to write about… (e.g., 'AI in healthcare', 'Latest trends in web development')"
                onValueChange={(value) =>
                  form.setValue('prompt', value, { shouldValidate: true })
                }
                onSubmit={submitFromPrompt}
                className="min-h-16"
              />
              <PromptBarToolbar
                density="compact"
                leading={
                  <PromptBarCompactSelect
                    ariaLabel="Number of Articles"
                    density="compact"
                    isDisabled={isSubmitting}
                    options={ARTICLE_COUNT_OPTIONS}
                    value={count || '1'}
                    onChange={(value) =>
                      form.setValue('count', value, { shouldValidate: true })
                    }
                  />
                }
                trailing={
                  <PromptBarSendButton
                    ariaLabel={generateLabel}
                    density="compact"
                    isDisabled={isSubmitDisabled}
                    isLoading={isSubmitting}
                    onClick={submitFromPrompt}
                    tooltip={generateLabel}
                  />
                }
              />
            </PromptBarComposer>
          </>
        ) : (
          <>
            {/* Manual Creation Fields */}
            <FormControl label="Title">
              <Input
                type="text"
                name="label"
                control={form.control}
                onChange={updateModalArticle}
                placeholder="Enter article title"
                isRequired={true}
                isDisabled={isSubmitting}
              />
            </FormControl>

            <FormControl label="Content">
              <Textarea
                name="content"
                control={form.control}
                onChange={updateModalArticle}
                placeholder="Start writing your article…"
                isRequired={true}
                isDisabled={isSubmitting}
                onKeyDown={processKeyDownModalArticle}
              />
            </FormControl>
          </>
        )}

        <div className="flex items-center justify-start gap-3">
          <Switch
            checked={useAI}
            onCheckedChange={handleToggleAI}
            isDisabled={isSubmitting}
          />
          <span className="flex items-center gap-2 text-sm">Enhance</span>
        </div>

        <ModalActions>
          <Button
            label="Cancel"
            variant={ButtonVariant.SECONDARY}
            onClick={() => closeModal(false)}
            isLoading={isSubmitting}
          />

          {useAI ? null : (
            <Button
              type="submit"
              label={
                isSubmitting ? (
                  <span className="inline-flex items-center gap-2">
                    <Spinner size={ComponentSize.XS} />
                    <span>Creating…</span>
                  </span>
                ) : (
                  'Create'
                )
              }
              variant={ButtonVariant.DEFAULT}
              isLoading={isSubmitting}
              isDisabled={isSubmitDisabled}
            />
          )}
        </ModalActions>
      </Form>
    </Modal>
  );
}
