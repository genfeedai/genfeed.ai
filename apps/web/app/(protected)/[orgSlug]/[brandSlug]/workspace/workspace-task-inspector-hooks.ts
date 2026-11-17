import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { Ingredient } from '@models/content/ingredient.model';
import { WorkflowExecutionsService } from '@services/automation/workflow-executions.service';
import { IngredientsService } from '@services/content/ingredients.service';
import { logger } from '@services/core/logger.service';
import { type Task, TasksService } from '@services/management/tasks.service';
import { useEffect, useMemo, useState } from 'react';
import {
  getEmptyLinkedExecutionSummary,
  getEmptyLinkedIssueSummary,
  getEmptyLinkedOutputSummary,
  isNonEmptyString,
  type WorkspaceTaskLinkedExecutionSummary,
  type WorkspaceTaskLinkedIssueSummary,
  type WorkspaceTaskLinkedOutputSummary,
} from './workspace-task-inspector-helpers';

export function useWorkspaceTaskLinkedExecutionSummary(
  task: Task | null,
): WorkspaceTaskLinkedExecutionSummary & { isLoading: boolean } {
  const { getToken } = useAuthIdentity();
  const [summary, setSummary] = useState<WorkspaceTaskLinkedExecutionSummary>(
    () => getEmptyLinkedExecutionSummary(),
  );
  // A task with linked executions reads them on mount, so the first paint is
  // loading rather than zero counts.
  const [isLoading, setIsLoading] = useState(
    () => (task?.linkedExecutionIds?.length ?? 0) > 0,
  );
  const _linkedExecutionIdsKey = useMemo(
    () => task?.linkedExecutionIds?.join('|') ?? '',
    [task?.linkedExecutionIds],
  );

  useEffect(() => {
    if (!task || (task.linkedExecutionIds?.length ?? 0) === 0) {
      setSummary(getEmptyLinkedExecutionSummary());
      setIsLoading(false);
      return;
    }

    const capturedTask = task;
    const linkedExecutionIds = capturedTask.linkedExecutionIds ?? [];

    const abortController = new AbortController();

    async function loadLinkedExecutionSummary() {
      try {
        setIsLoading(true);
        const token = await resolveAuthToken(getToken);
        if (abortController.signal.aborted) {
          return;
        }

        if (!token) {
          setSummary(getEmptyLinkedExecutionSummary());
          setIsLoading(false);
          return;
        }

        const service = WorkflowExecutionsService.getInstance(token);
        const batchResults = await Promise.all(
          linkedExecutionIds.map((executionId) => service.getById(executionId)),
        );

        if (abortController.signal.aborted) {
          return;
        }

        const reportThreadIds = Array.from(
          batchResults.reduce<Set<string>>((threadIds, result) => {
            const threadId = result.metadata?.threadId;
            if (isNonEmptyString(threadId)) {
              threadIds.add(threadId);
            }
            return threadIds;
          }, new Set()),
        );

        setSummary({
          generatedContentCount: batchResults.reduce((total, result) => {
            const references = result.metadata?.artifactReferences;
            return total + (Array.isArray(references) ? references.length : 0);
          }, 0),
          reportThreadCount: reportThreadIds.length,
          reportThreadId: reportThreadIds[0] ?? null,
        });
      } catch (error: unknown) {
        if (abortController.signal.aborted) {
          return;
        }

        logger.warn('Failed to resolve workspace task run summary', {
          error,
          reportToSentry: false,
          taskId: capturedTask.id,
        });
        setSummary(getEmptyLinkedExecutionSummary());
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadLinkedExecutionSummary();

    return () => {
      abortController.abort();
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
    const abortController = new AbortController();

    async function loadLinkedOutputs() {
      try {
        setSummary((current) => ({
          ...current,
          error: null,
          isLoading: true,
        }));

        const token = await resolveAuthToken(getToken);
        if (abortController.signal.aborted) {
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

        if (abortController.signal.aborted) {
          return;
        }

        setSummary({
          error: null,
          isLoading: false,
          outputs: outputs as Ingredient[],
        });
      } catch (error: unknown) {
        if (abortController.signal.aborted) {
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
      abortController.abort();
    };
  }, [getToken, task]);

  return summary;
}

export function useWorkspaceTaskLinkedIssue(
  task: Task | null,
): WorkspaceTaskLinkedIssueSummary {
  const { getToken } = useAuthIdentity();
  const { href } = useOrgUrl();
  const [summary, setSummary] = useState<WorkspaceTaskLinkedIssueSummary>(() =>
    getEmptyLinkedIssueSummary(),
  );

  useEffect(() => {
    if (!task?.linkedIssueId) {
      setSummary(getEmptyLinkedIssueSummary());
      return;
    }

    const capturedTask = task;
    const abortController = new AbortController();

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
        if (!token || abortController.signal.aborted) {
          setSummary(getEmptyLinkedIssueSummary());
          return;
        }

        const issue = await TasksService.getInstance(token).findOne(linkedId);

        if (abortController.signal.aborted) {
          return;
        }

        setSummary({
          href: href(`${APP_ROUTES.WORKSPACE.TASKS}/${issue.identifier}`),
          identifier: issue.identifier,
          isLoading: false,
        });
      } catch (error: unknown) {
        if (abortController.signal.aborted) {
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
      abortController.abort();
    };
  }, [getToken, href, task]);

  return summary;
}
