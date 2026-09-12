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

export interface UseStudioPromptEnhancementParams {
  brandId: string;
  modelKey: string;
  onPromptChange: (text: string) => void;
  prompt: string;
}

export interface UseStudioPromptEnhancementResult {
  /** Aborts a pending enhancement; safe to call when idle. */
  cancelEnhance: () => void;
  /** Never starts a generation — only replaces the composer's prompt text. */
  enhancePrompt: () => Promise<void>;
  isEnhancing: boolean;
  /** Set only once an enhancement has actually replaced the prompt. */
  previousPrompt: string | null;
  /** Restores `previousPrompt` into the composer. */
  undoEnhance: () => void;
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
 * On success the composer prompt is replaced in place, but only if it still
 * reads exactly as it did when the request was sent — an edit made while
 * enhancement was in flight is never clobbered. On failure, timeout, or
 * cancellation the prompt is left untouched and (for failure/timeout) a
 * notification explains what happened. Every callback checks a per-request
 * token and a mounted flag so a cancelled or unmounted enhancement can never
 * fire a toast or apply a stale result.
 */
export function useStudioPromptEnhancement({
  brandId,
  modelKey,
  onPromptChange,
  prompt,
}: UseStudioPromptEnhancementParams): UseStudioPromptEnhancementResult {
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [previousPrompt, setPreviousPrompt] = useState<string | null>(null);
  const promptRef = useRef(prompt);
  promptRef.current = prompt;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const isMountedRef = useRef(true);
  /** Bumped by every call and by cancel — a stale callback checks this. */
  const requestIdRef = useRef(0);

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

  const clearUndoTimeout = useCallback(() => {
    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      clearPending();
      clearUndoTimeout();
    };
  }, [clearPending, clearUndoTimeout]);

  const cancelEnhance = useCallback(() => {
    requestIdRef.current += 1;
    clearPending();
    setIsEnhancing(false);
  }, [clearPending]);

  const undoEnhance = useCallback(() => {
    if (previousPrompt === null) {
      return;
    }
    onPromptChange(previousPrompt);
    setPreviousPrompt(null);
    clearUndoTimeout();
    notificationsService.info('Prompt restored');
  }, [clearUndoTimeout, notificationsService, onPromptChange, previousPrompt]);

  const enhancePrompt = useCallback(async () => {
    const text = promptRef.current.trim();
    if (!text || isEnhancing) {
      return;
    }

    const requestId = ++requestIdRef.current;
    const isStale = () =>
      !isMountedRef.current || requestId !== requestIdRef.current;

    clearPending();
    setIsEnhancing(true);

    try {
      const service = await getPromptsService();
      if (isStale()) {
        return;
      }

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
      if (isStale()) {
        return;
      }

      const event = WebSocketPaths.prompt(created.id);
      timeoutRef.current = setTimeout(() => {
        if (isStale()) {
          return;
        }
        logger.error('Studio prompt enhancement timed out');
        notificationsService.error('Enhancement timed out. Please try again.');
        setIsEnhancing(false);
        clearPending();
      }, ENHANCEMENT_TIMEOUT_MS);

      unsubscribeRef.current = subscribe(
        event,
        createPromptHandler<string>(
          (result) => {
            if (isStale()) {
              clearPending();
              return;
            }
            clearPending();
            setIsEnhancing(false);

            // Only replace the prompt if the operator has not edited it
            // since the request was sent — never clobber a live edit with a
            // stale enhancement result.
            if (promptRef.current === text) {
              setPreviousPrompt(text);
              onPromptChange(result);
              clearUndoTimeout();
              undoTimeoutRef.current = setTimeout(() => {
                setPreviousPrompt(null);
                undoTimeoutRef.current = null;
              }, UNDO_TIMEOUT_MS);
            } else {
              notificationsService.info(
                'Prompt changed before enhancement finished — enhanced version discarded.',
              );
            }
          },
          (error) => {
            if (isStale()) {
              clearPending();
              return;
            }
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
      if (isStale()) {
        return;
      }
      logger.error('Studio prompt enhancement POST /prompts failed', {
        error,
      });
      notificationsService.error('Failed to enhance prompt');
      setIsEnhancing(false);
    }
  }, [
    brandId,
    clearPending,
    clearUndoTimeout,
    getPromptsService,
    isEnhancing,
    modelKey,
    notificationsService,
    onPromptChange,
    subscribe,
  ]);

  return {
    cancelEnhance,
    enhancePrompt,
    isEnhancing,
    previousPrompt,
    undoEnhance,
  };
}
