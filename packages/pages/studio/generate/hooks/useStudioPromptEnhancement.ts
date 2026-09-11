'use client';

import { PromptCategory } from '@genfeedai/contracts';
import {
  MODEL_OUTPUT_CAPABILITIES,
  type ModelCapabilityCategory,
} from '@genfeedai/contracts/constants';
import { Prompt } from '@genfeedai/models/content/prompt.model';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useSocketManager } from '@hooks/utils/use-socket-manager/use-socket-manager';
import { PromptsService } from '@services/content/prompts.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { createPromptHandler } from '@services/core/socket-manager.service';
import { WebSocketPaths } from '@utils/network/websocket.util';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const ENHANCEMENT_TIMEOUT_MS = 30000;

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

export interface UseStudioPromptEnhancementParams {
  brandId: string;
  modelKey: string;
  onPromptChange: (text: string) => void;
  prompt: string;
}

export interface UseStudioPromptEnhancementResult {
  /** Never starts a generation — only replaces the composer's prompt text. */
  enhancePrompt: () => Promise<void>;
  isEnhancing: boolean;
}

/**
 * Studio composer's "Enhance prompt" action (#4676 FR6/FR7). Reuses the same
 * backend flow as `usePromptBarEnhancement`
 * (packages/hooks/prompt-bar/use-prompt-bar-enhancement) — POST `/prompts`
 * with `isSkipEnhancement: false`, then wait on the prompt's WebSocket
 * completion event — reimplemented here rather than imported because that
 * hook binds directly to a react-hook-form field and a raw textarea ref,
 * while Studio's composer holds a plain `prompt` string edited through
 * `PromptEditor`, not react-hook-form.
 *
 * On success the composer prompt is replaced in place (still editable, never
 * auto-submitted). On failure or timeout the original prompt is left
 * untouched and a notification explains what happened.
 */
export function useStudioPromptEnhancement({
  brandId,
  modelKey,
  onPromptChange,
  prompt,
}: UseStudioPromptEnhancementParams): UseStudioPromptEnhancementResult {
  const [isEnhancing, setIsEnhancing] = useState(false);
  const promptRef = useRef(prompt);
  promptRef.current = prompt;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );
  const { subscribe } = useSocketManager();
  const getPromptsService = useAuthedService((token: string) =>
    PromptsService.getInstance(token),
  );

  const clearPending = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
  }, []);

  useEffect(() => clearPending, [clearPending]);

  const enhancePrompt = useCallback(async () => {
    const text = promptRef.current.trim();
    if (!text || isEnhancing) {
      return;
    }

    clearPending();
    setIsEnhancing(true);

    try {
      const service = await getPromptsService();
      const modelCapability = MODEL_OUTPUT_CAPABILITIES[modelKey];
      const promptCategory = modelCapability
        ? MODEL_CATEGORY_TO_PROMPT_CATEGORY[modelCapability.category]
        : PromptCategory.MODELS_PROMPT_IMAGE;

      const created = await service.post(
        new Prompt({
          brandId,
          category: promptCategory,
          isSkipEnhancement: false,
          model: modelKey || undefined,
          original: text,
        }),
      );

      const event = WebSocketPaths.prompt(created.id);
      timeoutRef.current = setTimeout(() => {
        logger.error('Studio prompt enhancement timed out');
        notificationsService.error('Enhancement timed out. Please try again.');
        setIsEnhancing(false);
        clearPending();
      }, ENHANCEMENT_TIMEOUT_MS);

      unsubscribeRef.current = subscribe(
        event,
        createPromptHandler<string>(
          (result) => {
            clearPending();
            onPromptChange(result);
            setIsEnhancing(false);
          },
          (error) => {
            clearPending();
            logger.error('Studio prompt enhancement failed via websocket', {
              error,
            });
            notificationsService.error('Enhancement failed. Please try again.');
            setIsEnhancing(false);
          },
        ),
      );
    } catch (error) {
      logger.error('Studio prompt enhancement POST /prompts failed', {
        error,
      });
      notificationsService.error('Failed to enhance prompt');
      setIsEnhancing(false);
    }
  }, [
    brandId,
    clearPending,
    getPromptsService,
    isEnhancing,
    modelKey,
    notificationsService,
    onPromptChange,
    subscribe,
  ]);

  return { enhancePrompt, isEnhancing };
}
