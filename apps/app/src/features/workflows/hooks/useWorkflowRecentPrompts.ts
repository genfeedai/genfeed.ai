'use client';

import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { PromptsService } from '@services/content/prompts.service';
import { logger } from '@services/core/logger.service';
import { useEffect, useState } from 'react';

const RECENT_PROMPT_LIMIT = 50;

export interface WorkflowRecentPrompt {
  id: string;
  text: string;
}

interface WorkflowRecentPromptsSnapshot {
  hasError: boolean;
  isLoading: boolean;
  prompts: readonly WorkflowRecentPrompt[];
}

const IDLE_SNAPSHOT: WorkflowRecentPromptsSnapshot = {
  hasError: false,
  isLoading: false,
  prompts: [],
};

/**
 * The caller's own earlier prompts, newest first, with duplicates folded so a
 * prompt reused across generations is listed once.
 */
export function useWorkflowRecentPrompts(
  isEnabled: boolean,
): WorkflowRecentPromptsSnapshot {
  const getPromptsService = useAuthedService((token: string) =>
    PromptsService.getInstance(token),
  );
  const [snapshot, setSnapshot] =
    useState<WorkflowRecentPromptsSnapshot>(IDLE_SNAPSHOT);

  useEffect(() => {
    if (!isEnabled) {
      return;
    }

    const controller = new AbortController();
    setSnapshot({ hasError: false, isLoading: true, prompts: [] });

    void (async () => {
      try {
        const service = await getPromptsService();
        const rows = await service.findAll(
          { limit: RECENT_PROMPT_LIMIT, sort: 'createdAt: -1' },
          controller.signal,
        );
        if (controller.signal.aborted) {
          return;
        }
        const seen = new Set<string>();
        const prompts: WorkflowRecentPrompt[] = [];
        for (const row of rows) {
          const text = row.original?.trim();
          if (!text || seen.has(text)) {
            continue;
          }
          seen.add(text);
          prompts.push({ id: row.id, text });
        }
        setSnapshot({ hasError: false, isLoading: false, prompts });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        logger.error('Failed to load recent workflow prompts', { error });
        setSnapshot({ hasError: true, isLoading: false, prompts: [] });
      }
    })();

    return () => controller.abort();
  }, [getPromptsService, isEnabled]);

  return snapshot;
}
