'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  ButtonSize,
  ButtonVariant,
  IngredientCategory,
  PromptCategory,
} from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useWebsocketPrompt } from '@hooks/utils/use-websocket-prompt/use-websocket-prompt';
import { Prompt } from '@models/content/prompt.model';
import type { ModalPostSetupTabProps } from '@props/modals/modal.props';
import { PromptsService } from '@services/content/prompts.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Button from '@ui/buttons/base/Button';
import FormControl from '@ui/forms/base/form-control/FormControl';
import FormInput from '@ui/forms/inputs/input/form-input/FormInput';
import FormTextarea from '@ui/forms/inputs/textarea/form-textarea/FormTextarea';
import FormDateTimePicker from '@ui/forms/pickers/date-time-picker/form-date-time-picker/FormDateTimePicker';
import { useCallback, useState } from 'react';
import { HiSparkles } from 'react-icons/hi2';

export default function ModalPostSetupTab({
  form,
  globalScheduledDate,
  setGlobalScheduledDate,
  settings,
  ingredient,
  isLoading,
  getMinDateTime,
}: ModalPostSetupTabProps) {
  const isImage = ingredient?.category === IngredientCategory.IMAGE;
  const { brandId } = useBrand();
  const [isGenerating, setIsGenerating] = useState(false);
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
        promptData.brand = brandId;
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
      <FormControl label="Title">
        <FormInput
          type="text"
          name="globalLabel"
          control={form.control}
          placeholder="Enter title for your post"
          isRequired={false}
          isDisabled={isLoading}
        />
        <p className="text-xs text-foreground/70 mt-1">
          {isImage
            ? 'Will be used for Instagram. Not applicable for Twitter.'
            : 'Will be used for YouTube, TikTok, and Instagram. Not applicable for Twitter.'}
        </p>
      </FormControl>

      <FormControl
        label="Description"
        helpText={
          hasPromptText
            ? 'Generate description from ingredient prompt or enter manually'
            : undefined
        }
      >
        <div className="space-y-2">
          {hasPromptText && (
            <Button
              type="button"
              label="Generate from Prompt"
              variant={ButtonVariant.DEFAULT}
              size={ButtonSize.SM}
              icon={<HiSparkles />}
              onClick={handleGenerateFromPrompt}
              isDisabled={isLoading || isGenerating}
              isLoading={isGenerating}
            />
          )}
          <FormTextarea
            name="globalDescription"
            control={form.control}
            placeholder="Enter a description for your post"
            className="border border-input px-3 py-2 h-32"
            isRequired={true}
            isDisabled={isLoading || isGenerating}
          />
        </div>
        <p className="text-xs text-foreground/70 mt-1">
          This will be the default description for all platforms. You can
          customize per platform in the next step.
        </p>
      </FormControl>

      <FormDateTimePicker
        label="Schedule Date & Time"
        value={globalScheduledDate || getMinDateTime()}
        onChange={setGlobalScheduledDate}
        minDate={getMinDateTime()}
        isRequired={true}
        timezone={settings?.timezone || 'UTC'}
        isDisabled={isLoading}
        helpText="Minimum 15 minutes from now. Can be overridden per platform in the next step."
      />
    </>
  );
}
