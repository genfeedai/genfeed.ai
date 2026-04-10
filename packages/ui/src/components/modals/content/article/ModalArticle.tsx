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
} from '@genfeedai/enums';
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
import Spinner from '@ui/feedback/spinner/Spinner';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import { Button } from '@ui/primitives/button';
import FormControl from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { SelectField } from '@ui/primitives/select';
import { Switch } from '@ui/primitives/switch';
import { Textarea } from '@ui/primitives/textarea';
import { type ChangeEvent, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { HiSparkles } from 'react-icons/hi2';

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

  const handleSubmit = async () => {
    try {
      const service = await getArticlesService();
      const formData = form.getValues();

      // Validate based on mode
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
    handleSubmit(),
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (!isSubmitting) {
        handleSubmit();
      }
    }
  };

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    form.setValue(name as any, value, { shouldValidate: true });
  };

  const count = form.watch('count');
  const countNumber =
    typeof count === 'string' ? parseInt(count, 10) : count || 1;

  return (
    <Modal id={ModalEnum.ARTICLE} title="Create New Article">
      <form ref={formRef} onSubmit={onSubmit}>
        {hasFormErrors(form.formState.errors) && (
          <Alert type={AlertCategory.ERROR} className="mb-4">
            <div className="space-y-1">
              {parseFormErrors(form.formState.errors).map((error, index) => (
                <div key={index}>{error}</div>
              ))}
            </div>
          </Alert>
        )}

        {useAI ? (
          <>
            {/* AI Generation Fields */}
            <FormControl label="Article Idea">
              <Textarea
                name="prompt"
                control={form.control}
                onChange={handleChange}
                placeholder="Describe what you want to write about... (e.g., 'AI in healthcare', 'Latest trends in web development')"
                isRequired={true}
                isDisabled={isSubmitting}
                onKeyDown={handleKeyDown}
              />
            </FormControl>

            <FormControl label="Number of Articles">
              <SelectField
                name="count"
                control={form.control}
                isDisabled={isSubmitting}
                placeholder="Select number of articles"
              >
                <option value="1">1 Article</option>
                <option value="2">2 Articles</option>
                <option value="3">3 Articles</option>
                <option value="4">4 Articles</option>
              </SelectField>
            </FormControl>
          </>
        ) : (
          <>
            {/* Manual Creation Fields */}
            <FormControl label="Title">
              <Input
                type="text"
                name="label"
                control={form.control}
                onChange={handleChange}
                placeholder="Enter article title"
                isRequired={true}
                isDisabled={isSubmitting}
              />
            </FormControl>

            <FormControl label="Content">
              <Textarea
                name="content"
                control={form.control}
                onChange={handleChange}
                placeholder="Start writing your article..."
                isRequired={true}
                isDisabled={isSubmitting}
                onKeyDown={handleKeyDown}
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

          <Button
            type="submit"
            label={
              isSubmitting ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner size={ComponentSize.XS} />
                  <span>{useAI ? 'Generating...' : 'Creating...'}</span>
                </span>
              ) : useAI ? (
                <span className="inline-flex items-center gap-2">
                  <HiSparkles className="w-4 h-4" />
                  <span>
                    Generate {countNumber} Article{countNumber > 1 ? 's' : ''}
                  </span>
                </span>
              ) : (
                'Create'
              )
            }
            variant={ButtonVariant.DEFAULT}
            isLoading={isSubmitting}
            isDisabled={
              isSubmitting ||
              (useAI
                ? !form.watch('prompt')?.trim() || !form.watch('count')
                : !form.watch('label')?.trim() ||
                  !form.watch('content')?.trim())
            }
          />
        </ModalActions>
      </form>
    </Modal>
  );
}
