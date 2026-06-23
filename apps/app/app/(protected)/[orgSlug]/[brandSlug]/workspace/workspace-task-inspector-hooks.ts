import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import type { Ingredient } from '@models/content/ingredient.model';
import { AgentRunsService } from '@services/ai/agent-runs.service';
import { IngredientsService } from '@services/content/ingredients.service';
import { logger } from '@services/core/logger.service';
import { type Task, TasksService } from '@services/management/tasks.service';
import { useEffect, useMemo, useState } from 'react';
import {
  getEmptyLinkedIssueSummary,
  getEmptyLinkedOutputSummary,
  getEmptyLinkedRunSummary,
  isNonEmptyString,
  type WorkspaceTaskLinkedIssueSummary,
  type WorkspaceTaskLinkedOutputSummary,
  type WorkspaceTaskLinkedRunSummary,
} from './workspace-task-inspector-helpers';

// ─── Private hooks ────────────────────────────────────────────────────────────

export function useWorkspaceTaskLinkedRunSummary(
  task: Task | null,
): WorkspaceTaskLinkedRunSummary & { isLoading: boolean } {
  const { getToken } = useAuthIdentity();
  const [summary, setSummary] = useState<WorkspaceTaskLinkedRunSummary>(() =>
    getEmptyLinkedRunSummary(),
  );
  const [isLoading, setIsLoading] = useState(false);
  const _linkedRunIdsKey = useMemo(
    () => task?.linkedRunIds?.join('|') ?? '',
    [task?.linkedRunIds],
  );

  useEffect(() => {
    if (!task || (task.linkedRunIds?.length ?? 0) === 0) {
      setSummary(getEmptyLinkedRunSummary());
      setIsLoading(false);
      return;
    }

    const capturedTask = task;
    const linkedRunIds = capturedTask.linkedRunIds ?? [];

    let isCancelled = false;

    async function loadLinkedRunSummary() {
      try {
        setIsLoading(true);
        const token = await resolveAuthToken(getToken);
        if (isCancelled) {
          return;
        }

        if (!token) {
          setSummary(getEmptyLinkedRunSummary());
          setIsLoading(false);
          return;
        }

        const service = AgentRunsService.getInstance(token);
        const batchResults = await service.getBatch(linkedRunIds);

        if (isCancelled) {
          return;
        }

        const reportThreadIds = Array.from(
          batchResults.reduce<Set<string>>((threadIds, result) => {
            if (isNonEmptyString(result.threadId)) {
              threadIds.add(result.threadId);
            }
            return threadIds;
          }, new Set()),
        );

        setSummary({
          generatedContentCount: batchResults.reduce(
            (total, result) => total + result.contentCount,
            0,
          ),
          reportThreadCount: reportThreadIds.length,
          reportThreadId: reportThreadIds[0] ?? null,
        });
      } catch (error: unknown) {
        if (isCancelled) {
          return;
        }

        logger.warn('Failed to resolve workspace task run summary', {
          error,
          reportToSentry: false,
          taskId: capturedTask.id,
        });
        setSummary(getEmptyLinkedRunSummary());
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadLinkedRunSummary();

    return () => {
      isCancelled = true;
    };
  }, [getToken, task]);

  return {
    ...summary,
    isLoading,
  };
}

export function useWorkspaceTaskLinkedOutputs(
  task: Task | null,
): WorkspaceTaskLinkedOutputSummary {
  const { getToken } = useAuthIdentity();
  const [summary, setSummary] = useState<WorkspaceTaskLinkedOutputSummary>(() =>
    getEmptyLinkedOutputSummary(),
  );
  const _linkedOutputIdsKey = useMemo(
    () => task?.linkedOutputIds?.join('|') ?? '',
    [task?.linkedOutputIds],
  );

  useEffect(() => {
    if (!task || (task.linkedOutputIds?.length ?? 0) === 0) {
      setSummary(getEmptyLinkedOutputSummary());
      return;
    }

    const capturedTask = task;
    let isCancelled = false;

    async function loadLinkedOutputs() {
      try {
        setSummary((current) => ({
          ...current,
          error: null,
          isLoading: true,
        }));

        const token = await resolveAuthToken(getToken);
        if (isCancelled) {
          return;
        }

        if (!token) {
          setSummary(getEmptyLinkedOutputSummary());
          return;
        }

        const service = IngredientsService.getInstance(token);
        const linkedOutputIds = Array.from(
          new Set(capturedTask.linkedOutputIds ?? []),
        );
        const outputs = await service.findByIds(linkedOutputIds);

        if (isCancelled) {
          return;
        }

        setSummary({
          error: null,
          isLoading: false,
          outputs: outputs as Ingredient[],
        });
      } catch (error: unknown) {
        if (isCancelled) {
          return;
        }

        logger.warn('Failed to resolve workspace task linked outputs', {
          error,
          reportToSentry: false,
          taskId: capturedTask.id,
        });
        setSummary({
          error: 'Linked outputs could not be loaded right now.',
          isLoading: false,
          outputs: [],
        });
      }
    }

    void loadLinkedOutputs();

    return () => {
      isCancelled = true;
    };
  }, [getToken, task]);

  return summary;
}

export function useWorkspaceTaskLinkedIssue(
  task: Task | null,
): WorkspaceTaskLinkedIssueSummary {
  const { getToken } = useAuthIdentity();
  const [summary, setSummary] = useState<WorkspaceTaskLinkedIssueSummary>(() =>
    getEmptyLinkedIssueSummary(),
  );

  useEffect(() => {
    if (!task?.linkedIssueId) {
      setSummary(getEmptyLinkedIssueSummary());
      return;
    }

    const capturedTask = task;
    let isCancelled = false;

    async function loadLinkedIssue() {
      try {
        setSummary({
          href: null,
          identifier: null,
          isLoading: true,
        });

        const linkedId = capturedTask.linkedIssueId;
        if (!linkedId) {
          setSummary(getEmptyLinkedIssueSummary());
          return;
        }

        const token = await resolveAuthToken(getToken);
        if (!token || isCancelled) {
          setSummary(getEmptyLinkedIssueSummary());
          return;
        }

        const issue = await TasksService.getInstance(token).findOne(linkedId);

        if (isCancelled) {
          return;
        }

        setSummary({
          href: `/tasks/${issue.identifier}`,
          identifier: issue.identifier,
          isLoading: false,
        });
      } catch (error: unknown) {
        if (isCancelled) {
          return;
        }

        logger.warn('Failed to resolve workspace task linked issue', {
          error,
          reportToSentry: false,
          taskId: capturedTask.id,
        });
        setSummary(getEmptyLinkedIssueSummary());
      }
    }

    void loadLinkedIssue();

    return () => {
      isCancelled = true;
    };
  }, [getToken, task]);

  return summary;
}
