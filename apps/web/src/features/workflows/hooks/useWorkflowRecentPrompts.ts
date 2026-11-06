'use client';

import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { PromptsService } from '@services/content/prompts.service';
import { logger } from '@services/core/logger.service';

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

const EMPTY_PROMPTS: readonly WorkflowRecentPrompt[] = [];

/**
 * The caller's own earlier prompts, newest first, with duplicates folded so a
 * prompt reused across generations is listed once.
 *
 * Cached per viewer, so reopening the prompt picker lists them at once and
 * refreshes them in the background.
 */
export function useWorkflowRecentPrompts(
  isEnabled: boolean,
): WorkflowRecentPromptsSnapshot {
  const promptsQuery = useAuthedQuery<
    PromptsService,
    readonly WorkflowRecentPrompt[]
  >({
    enabled: isEnabled,
    queryFn: async (service, signal) => {
      try {
        const rows = await service.findAll(
          { limit: RECENT_PROMPT_LIMIT, sort: 'createdAt: -1' },
          signal,
        );
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
        return prompts;
      } catch (error) {
        if (!signal.aborted) {
          logger.error('Failed to load recent workflow prompts', { error });
        }
        throw error;
      }
    },
    queryKey: ['workflow-recent-prompts', { limit: RECENT_PROMPT_LIMIT }],
    service: (token: string) => PromptsService.getInstance(token),
  });

  const prompts = promptsQuery.data;
  return {
    // A failed background refresh keeps the prompts already listed.
    hasError: promptsQuery.isError && prompts === undefined,
    isLoading: promptsQuery.isLoading,
    prompts: prompts ?? EMPTY_PROMPTS,
  };
}
