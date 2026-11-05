'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import {
  ButtonSize,
  ButtonVariant,
  IngredientCategory,
  PromptCategory,
  SystemPromptKey,
} from '@genfeedai/contracts';
import { getBrowserTimezone } from '@genfeedai/helpers/formatting/timezone/timezone.helper';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { Prompt } from '@genfeedai/models/content/prompt.model';
import type { ModalPostSetupTabProps } from '@genfeedai/props/modals/modal.props';
import { PromptsService } from '@genfeedai/services/content/prompts.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { Button } from '@ui/primitives/button';
import FormDateTimePicker from '@ui/primitives/date-time-picker';
import FormControl from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { Textarea } from '@ui/primitives/textarea';
import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { resolvePublishingTimezone } from '@/components/modals/content/batch/batch-platform-sync';
import PostCharacterUsage from '@/components/posts/character-usage/PostCharacterUsage';
import { buildPostCharacterUsageItems } from '@/components/posts/character-usage/post-character-usage.util';
import { useWebsocketPrompt } from '@/hooks/utils/use-websocket-prompt/use-websocket-prompt';

/**
 * Left column of the schedule modal: the shared title and caption every
 * channel carries, how long that caption runs on each channel, and when it all
 * goes out.
 */
export default function ModalPostSetupTab({
  form,
  platformConfigs,
  globalScheduledDate,
  setGlobalScheduledDate,
  settings,
  ingredient,
  isLoading,
  getMinDateTime,
}: ModalPostSetupTabProps) {
  const translate = useTranslations('ui.postBatch.setup');
  const isImage = ingredient?.category === IngredientCategory.IMAGE;
  const scheduleTimezone = resolvePublishingTimezone(
    settings?.timezone,
    getBrowserTimezone(),
  );
  const { brandId, credentials } = useBrand();
  const globalDescription = form.watch('globalDescription');
  const characterUsageItems = useMemo(
    () =>
      buildPostCharacterUsageItems(
        platformConfigs,
        globalDescription,
        credentials,
      ),
    [credentials, globalDescription, platformConfigs],
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingTitle, setIsGeneratingTitle] = useState(false);
  const notificationsService = NotificationsService.getInstance();

  const getPromptsService = useAuthedService((token) =>
    PromptsService.getInstance(token),
  );

  const listenForPrompt = useWebsocketPrompt<string>({
    errorMessage: 'Failed to generate description. Please try again.',
    onError: () => {
      setIsGenerating(false);
    },
    onSuccess: (result) => {
      setIsGenerating(false);
      form.setValue('globalDescription', result);
      notificationsService.success('Description generated successfully');
    },
    timeoutMessage: 'Generation timed out. Please try again.',
    timeoutMs: 30000,
  });

  const listenForTitle = useWebsocketPrompt<string>({
    errorMessage: 'Failed to generate title. Please try again.',
    onError: () => {
      setIsGeneratingTitle(false);
    },
    onSuccess: (result) => {
      setIsGeneratingTitle(false);
      form.setValue('globalLabel', result.trim());
      notificationsService.success('Title generated successfully');
    },
    timeoutMessage: 'Generation timed out. Please try again.',
    timeoutMs: 30000,
  });

  const handleGenerateTitle = useCallback(async () => {
    const source =
      form.getValues('globalDescription')?.trim() || ingredient?.promptText;

    if (!source) {
      return notificationsService.error(
        'Add a description first so the title has something to work from',
      );
    }

    setIsGeneratingTitle(true);
    const url = 'POST /prompts';

    try {
      const service = await getPromptsService();
      const promptData: Partial<Prompt> = {
        category: PromptCategory.POST_TITLE_YOUTUBE,
        isSkipEnhancement: false,
        original: source,
        systemPromptKey: SystemPromptKey.YOUTUBE_TITLE,
        useRAG: true,
      };

      if (brandId) {
        promptData.brandId = brandId;
      }

      const prompt = await service.post(new Prompt(promptData));

      logger.info(`${url} success`, { promptId: prompt.id });
      listenForTitle(prompt.id);
    } catch (error) {
      setIsGeneratingTitle(false);
      logger.error(`${url} failed`, error);
      notificationsService.error(
        'Failed to start generation. Please try again.',
      );
    }
  }, [
    form,
    ingredient,
    getPromptsService,
    brandId,
    listenForTitle,
    notificationsService,
  ]);

  const handleGenerateFromPrompt = useCallback(async () => {
    if (!ingredient?.promptText) {
      return notificationsService.error(
        'No prompt available for this ingredient',
      );
    }

    setIsGenerating(true);
    const url = 'POST /prompts';

    try {
      const service = await getPromptsService();
      const promptData: Partial<Prompt> = {
        category: PromptCategory.POST_CONTENT_TWITTER,
        isSkipEnhancement: false,
        original: ingredient.promptText,
        useRAG: true,
      };

      if (brandId) {
        promptData.brandId = brandId;
      }

      const prompt = await service.post(new Prompt(promptData));

      logger.info(`${url} success`, { promptId: prompt.id });
      listenForPrompt(prompt.id);
    } catch (error) {
      setIsGenerating(false);
      logger.error(`${url} failed`, error);
      notificationsService.error(
        'Failed to start generation. Please try again.',
      );
    }
  }, [
    ingredient,
    getPromptsService,
    brandId,
    listenForPrompt,
    notificationsService,
  ]);

  const hasPromptText = Boolean(ingredient?.promptText);

  return (
    <>
      <FormControl
        label={translate('titleLabel')}
        helpText={
          isImage ? translate('titleHelpImage') : translate('titleHelpVideo')
        }
      >
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <Input
              type="text"
              name="globalLabel"
              control={form.control}
              placeholder={translate('titlePlaceholder')}
              isRequired={false}
              isDisabled={isLoading || isGeneratingTitle}
            />
          </div>
          <Button
            type="button"
            ariaLabel={translate('generateTitle')}
            icon={<Sparkles />}
            isDisabled={isLoading || isGeneratingTitle}
            isLoading={isGeneratingTitle}
            label={translate('aiShort')}
            onClick={handleGenerateTitle}
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
          />
        </div>
      </FormControl>

      <FormControl
        label={translate('descriptionLabel')}
        helpText={translate('descriptionHelp')}
      >
        <div className="space-y-2">
          {hasPromptText && (
            <Button
              type="button"
              label={translate('generateFromPrompt')}
              variant={ButtonVariant.DEFAULT}
              size={ButtonSize.SM}
              icon={<Sparkles />}
              onClick={handleGenerateFromPrompt}
              isDisabled={isLoading || isGenerating}
              isLoading={isGenerating}
            />
          )}
          <Textarea
            name="globalDescription"
            control={form.control}
            placeholder={translate('descriptionPlaceholder')}
            className="border border-input px-3 py-2 h-32"
            isRequired={true}
            isDisabled={isLoading || isGenerating}
          />
        </div>
      </FormControl>

      <PostCharacterUsage
        items={characterUsageItems}
        title={translate('charactersUsed')}
      />

      <FormDateTimePicker
        label={translate('scheduleLabel')}
        value={globalScheduledDate || getMinDateTime()}
        onChange={setGlobalScheduledDate}
        minDate={getMinDateTime()}
        isRequired={true}
        timezone={scheduleTimezone}
        isDisabled={isLoading}
        helpText={translate('scheduleHelp')}
      />
    </>
  );
}
