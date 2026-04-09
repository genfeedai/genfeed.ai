'use client';

import type { AiActionType } from '@genfeedai/enums';
import { AiActionsService } from '@genfeedai/services/ai/ai-actions.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { useCallback, useEffect, useRef, useState } from 'react';

interface UseAiActionOptions {
  orgId: string;
  token: string;
}

interface UseAiActionReturn {
  execute: (
    content: string,
    context?: Record<string, string>,
  ) => Promise<string | undefined>;
  isLoading: boolean;
  result: string | null;
  error: string | null;
  undo: () => void;
  previousValue: string | null;
}

export function useAiAction(
  action: AiActionType,
  options: UseAiActionOptions,
): UseAiActionReturn {
  const { orgId, token } = options;
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previousValue, setPreviousValue] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const execute = useCallback(
    async (
      content: string,
      context?: Record<string, string>,
    ): Promise<string | undefined> => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();

      setIsLoading(true);
      setError(null);
      setPreviousValue(content);

      try {
        const service = AiActionsService.getInstance(token);
        const response = await service.execute(orgId, {
          action,
          content,
          context,
        });

        setResult(response.result);
        setIsLoading(false);
        return response.result;
      } catch (err: unknown) {
        const isCancelled =
          err instanceof Error && err.message?.includes('abort');

        if (!isCancelled) {
          const message =
            err instanceof Error ? err.message : 'AI action failed';
          setError(message);
          logger.error(`useAiAction.${action} failed`, err);
          NotificationsService.getInstance().error(
            `Failed to execute AI action`,
          );
        }

        setIsLoading(false);
        return undefined;
      }
    },
    [action, orgId, token],
  );

  const undo = useCallback(() => {
    if (previousValue !== null) {
      setResult(previousValue);
      setPreviousValue(null);
    }
  }, [previousValue]);

  return { error, execute, isLoading, previousValue, result, undo };
}
