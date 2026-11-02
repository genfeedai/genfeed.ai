import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { SystemPromptKey } from '@genfeedai/contracts';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { useSocketManager } from '@genfeedai/hooks/utils/use-socket-manager/use-socket-manager';
import { Prompt } from '@genfeedai/models/content/prompt.model';
import { PromptsService } from '@genfeedai/services/content/prompts.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { createPromptHandler } from '@genfeedai/services/core/socket-manager.service';
import { WebSocketPaths } from '@genfeedai/utils/network/websocket.util';
import { useCallback, useEffect, useRef, useState } from 'react';

const ENHANCE_TIMEOUT_MS = 30_000;

function resolveSystemPromptKey(category: string): SystemPromptKey {
  if (category === 'video') {
    return SystemPromptKey.VIDEO;
  }
  if (category === 'music') {
    return SystemPromptKey.MUSIC;
  }
  return SystemPromptKey.IMAGE;
}

interface PromptEnhanceReturn {
  /** True from the request until the enhanced text arrives or fails. */
  isEnhancing: boolean;
  /**
   * Asks the AI to rewrite `original` for a preset `category` (image, video,
   * music) and resolves with the enhanced text. Rejects when the request
   * fails or takes longer than 30 seconds.
   */
  enhance: (original: string, category: string) => Promise<string>;
}

/**
 * AI "Enhance" for a description: posts the prompt, then waits for the socket
 * event carrying the rewritten text. Used by the preset create modal and the
 * preset context panel so both enhance the same way.
 */
export function usePromptEnhance(): PromptEnhanceReturn {
  const { brandId, organizationId } = useBrand();
  const getPromptsService = useAuthedService((token: string) =>
    PromptsService.getInstance(token),
  );
  const { subscribe } = useSocketManager();
  const [isEnhancing, setIsEnhancing] = useState(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const cleanup = useCallback(() => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const enhance = useCallback(
    async (original: string, category: string): Promise<string> => {
      setIsEnhancing(true);
      const url = 'POST /prompts';

      try {
        const service = await getPromptsService();
        const data = await service.post(
          new Prompt({
            brandId,
            category: `presets-description-${category}`,
            isSkipEnhancement: false,
            organizationId,
            original,
            systemPromptKey: resolveSystemPromptKey(category),
            useRAG: true,
          }),
        );
        logger.info(`${url} success`, data);

        return await new Promise<string>((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            cleanup();
            reject(new Error('Enhancement timed out'));
          }, ENHANCE_TIMEOUT_MS);

          cleanup();
          unsubscribeRef.current = subscribe(
            WebSocketPaths.prompt(data.id),
            createPromptHandler<string>(
              (result) => {
                clearTimeout(timeoutId);
                cleanup();
                resolve(result);
              },
              (error) => {
                clearTimeout(timeoutId);
                cleanup();
                reject(new Error(error));
              },
            ),
          );
        });
      } catch (error) {
        logger.error(`${url} failed`, error);
        throw error;
      } finally {
        setIsEnhancing(false);
      }
    },
    [brandId, cleanup, getPromptsService, organizationId, subscribe],
  );

  return { enhance, isEnhancing };
}
