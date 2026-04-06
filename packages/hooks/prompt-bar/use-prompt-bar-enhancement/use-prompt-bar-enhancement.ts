import {
  MODEL_OUTPUT_CAPABILITIES,
  type ModelCapabilityCategory,
} from '@genfeedai/constants';
import { PromptCategory } from '@genfeedai/enums';
import { Prompt } from '@models/content/prompt.model';
import type {
  UsePromptBarEnhancementOptions,
  UsePromptBarEnhancementReturn,
} from '@props/studio/prompt-bar.props';
import { logger } from '@services/core/logger.service';
import { createPromptHandler } from '@services/core/socket-manager.service';
import { WebSocketPaths } from '@utils/network/websocket.util';
import { useCallback, useEffect, useRef, useState } from 'react';

const ENHANCEMENT_TIMEOUT_MS = 30000;
const UNDO_TIMEOUT_MS = 30000;

const MODEL_CATEGORY_TO_PROMPT_CATEGORY: Record<
  ModelCapabilityCategory,
  PromptCategory
> = {
  embedding: PromptCategory.MODELS_PROMPT_IMAGE,
  image: PromptCategory.MODELS_PROMPT_IMAGE,
  'image-edit': PromptCategory.MODELS_PROMPT_IMAGE,
  'image-upscale': PromptCategory.MODELS_PROMPT_IMAGE,
  music: PromptCategory.MODELS_PROMPT_MUSIC,
  text: PromptCategory.MODELS_PROMPT_IMAGE,
  video: PromptCategory.MODELS_PROMPT_VIDEO,
  'video-edit': PromptCategory.MODELS_PROMPT_VIDEO,
  'video-upscale': PromptCategory.MODELS_PROMPT_VIDEO,
  voice: PromptCategory.MODELS_PROMPT_MUSIC,
};

export function usePromptBarEnhancement(
  options: UsePromptBarEnhancementOptions,
): UsePromptBarEnhancementReturn {
  const {
    form,
    watchedModel,
    organizationId,
    brandId,
    selectedProfile,
    getPromptsService,
    subscribe,
    notificationsService,
    clipboardService,
    textareaRef,
    resizeTextarea,
    setTextValue,
  } = options;

  const [isEnhancing, setIsEnhancing] = useState(false);
  const [previousPrompt, setPreviousPrompt] = useState<string | null>(null);
  const undoTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const socketSubscriptionsRef = useRef<Array<() => void>>([]);
  const timeoutRefsRef = useRef<Array<NodeJS.Timeout>>([]);

  const removeTimeout = useCallback((timeoutId: NodeJS.Timeout) => {
    clearTimeout(timeoutId);
    timeoutRefsRef.current = timeoutRefsRef.current.filter(
      (t) => t !== timeoutId,
    );
  }, []);

  const clearUndoTimeout = useCallback(() => {
    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      for (const unsubscribe of socketSubscriptionsRef.current) unsubscribe();
      socketSubscriptionsRef.current = [];
      timeoutRefsRef.current.forEach(clearTimeout);
      timeoutRefsRef.current = [];
      clearUndoTimeout();
    };
  }, [clearUndoTimeout]);

  const updateTextarea = useCallback(
    (value: string) => {
      form.setValue('text', value, { shouldValidate: true });
      if (textareaRef.current) {
        textareaRef.current.value = value;
        resizeTextarea(textareaRef.current);
      }
      setTextValue(value.trim());
    },
    [form, textareaRef, resizeTextarea, setTextValue],
  );

  const listenForSocket = useCallback(
    (type: string, promptId: string) => {
      const event = WebSocketPaths.prompt(promptId);

      const timeoutId = setTimeout(() => {
        logger.error('Prompt enhancement timed out');
        notificationsService.error('Enhancement timed out. Please try again.');
        setIsEnhancing(false);
        removeTimeout(timeoutId);
      }, ENHANCEMENT_TIMEOUT_MS);

      timeoutRefsRef.current.push(timeoutId);

      const handler = createPromptHandler<string>(
        (result: string) => {
          removeTimeout(timeoutId);
          if (type === 'prompts') {
            updateTextarea(result);
            setIsEnhancing(false);

            clearUndoTimeout();
            undoTimeoutRef.current = setTimeout(() => {
              setPreviousPrompt(null);
              undoTimeoutRef.current = null;
            }, UNDO_TIMEOUT_MS);
          }
        },
        (error: string) => {
          removeTimeout(timeoutId);
          logger.error('Prompt enhancement failed via websocket', error);
          notificationsService.error('Enhancement failed. Please try again.');
          setIsEnhancing(false);
        },
      );

      const unsubscribe = subscribe(event, handler);
      socketSubscriptionsRef.current.push(unsubscribe);
    },
    [
      clearUndoTimeout,
      notificationsService,
      removeTimeout,
      subscribe,
      updateTextarea,
    ],
  );

  const enhancePrompt = useCallback(async () => {
    const currentText = form.getValues('text');
    setPreviousPrompt(currentText || null);
    clearUndoTimeout();
    setIsEnhancing(true);

    try {
      const service = await getPromptsService();
      const modelCapability = MODEL_OUTPUT_CAPABILITIES[watchedModel as string];
      const promptCategory = modelCapability
        ? MODEL_CATEGORY_TO_PROMPT_CATEGORY[modelCapability.category]
        : PromptCategory.MODELS_PROMPT_IMAGE;

      const data = await service.post(
        new Prompt({
          brand: brandId,
          category: promptCategory,
          isSkipEnhancement: false,
          model: watchedModel,
          organization: organizationId,
          original: form.getValues('text'),
          profileId: selectedProfile || undefined,
          useRAG: true,
        }),
      );

      logger.info('POST /prompts success', data);
      listenForSocket('prompts', data.id);
    } catch (error) {
      logger.error('POST /prompts failed', error);
      notificationsService.error('Failed to enhance prompt');
      setIsEnhancing(false);
    }
  }, [
    brandId,
    clearUndoTimeout,
    form,
    getPromptsService,
    listenForSocket,
    notificationsService,
    organizationId,
    selectedProfile,
    watchedModel,
  ]);

  const handleUndo = useCallback(() => {
    if (previousPrompt === null) {
      return;
    }

    updateTextarea(previousPrompt);
    setPreviousPrompt(null);
    clearUndoTimeout();
    notificationsService.info('Prompt restored');
  }, [clearUndoTimeout, notificationsService, previousPrompt, updateTextarea]);

  const handleCopy = useCallback(
    async (text: string) => {
      await clipboardService.copyToClipboard(text);
    },
    [clipboardService],
  );

  return {
    enhancePrompt,
    handleCopy,
    handleUndo,
    isEnhancing,
    previousPrompt,
    socketSubscriptionsRef,
    timeoutRefsRef,
  };
}
