import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { runAgentApiEffect } from '@genfeedai/agent/services/agent-base-api.service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { type ReactElement, useCallback, useRef, useState } from 'react';
import {
  HiCheckCircle,
  HiExclamationCircle,
  HiOutlineBolt,
} from 'react-icons/hi2';

interface WorkflowTriggerCardProps {
  action: AgentUiAction;
  apiService: AgentApiService;
}

type CardStatus = 'idle' | 'triggering' | 'done' | 'error';

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-green-500/10 text-green-600 dark:text-green-400',
  draft: 'bg-muted text-muted-foreground',
  inactive: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
  paused: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
};

export function WorkflowTriggerCard({
  action,
  apiService,
}: WorkflowTriggerCardProps): ReactElement {
  const { href } = useOrgUrl();
  const workflows = action.workflows ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<CardStatus>('idle');
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleTrigger = useCallback(async () => {
    if (!selectedId) return;

    setStatus('triggering');
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await runAgentApiEffect(
        apiService.triggerWorkflowEffect(selectedId, {}, controller.signal),
      );
      setExecutionId(result.id);
      setStatus('done');
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      setError(
        err instanceof Error ? err.message : 'Failed to trigger workflow',
      );
      setStatus('error');
    }
  }, [selectedId, apiService]);

  const handleRetry = useCallback(() => {
    setStatus('idle');
    setError(null);
    setExecutionId(null);
  }, []);

  if (workflows.length === 0) {
    return (
      <div className="mt-2 overflow-hidden rounded-lg border border-border bg-background">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <HiOutlineBolt className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-foreground">
            {action.title}
          </span>
        </div>
        <div className="p-4 text-center">
          <p className="mb-2 text-sm text-muted-foreground">
            No workflows found
          </p>
          <a
            href={href('/workflows')}
            className="text-xs font-medium text-primary underline-offset-2 hover:underline"
          >
            Create a workflow →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-border bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <HiOutlineBolt className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium text-foreground">
          {action.title}
        </span>
      </div>

      <div className="space-y-3 p-3">
        {/* Workflow list */}
        <div className="space-y-1.5">
          {workflows.map((wf) => (
            <button
              key={wf.id}
              type="button"
              disabled={status !== 'idle'}
              onClick={() => setSelectedId(wf.id)}
              className={`w-full rounded border px-3 py-2 text-left transition-colors disabled:opacity-50 ${
                selectedId === wf.id
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50 hover:bg-accent'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-foreground">
                  {wf.name}
                </span>
                {wf.status && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${STATUS_BADGE[wf.status] ?? STATUS_BADGE.draft}`}
                  >
                    {wf.status}
                  </span>
                )}
              </div>
              {wf.description && (
                <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                  {wf.description}
                </p>
              )}
            </button>
          ))}
        </div>

        {/* Trigger button */}
        {status === 'idle' && (
          <button
            type="button"
            onClick={handleTrigger}
            disabled={!selectedId}
            className="flex w-full items-center justify-center gap-2 rounded bg-primary px-4 py-2 text-sm font-black text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            <HiOutlineBolt className="h-4 w-4" />
            Run Workflow
          </button>
        )}

        {/* Triggering state */}
        {status === 'triggering' && (
          <div className="flex items-center justify-center gap-2 rounded border border-border px-4 py-3">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="text-sm text-muted-foreground">
              Starting workflow…
            </span>
          </div>
        )}

        {/* Done state */}
        {status === 'done' && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 rounded border border-green-200 bg-green-50 px-3 py-2 dark:border-green-800 dark:bg-green-950">
              <HiCheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
              <span className="text-sm text-green-700 dark:text-green-300">
                Workflow started successfully
              </span>
            </div>
            {executionId && (
              <a
                href={href(`/workflows/executions/${executionId}`)}
                className="flex w-full items-center justify-center gap-1 rounded border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
              >
                View Execution →
              </a>
            )}
          </div>
        )}

        {/* Error state */}
        {status === 'error' && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 dark:border-red-800 dark:bg-red-950">
              <HiExclamationCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
              <span className="text-sm text-red-700 dark:text-red-300">
                {error}
              </span>
            </div>
            <button
              type="button"
              onClick={handleRetry}
              className="flex w-full items-center justify-center rounded border border-border px-4 py-2 text-sm font-black text-foreground transition-colors hover:bg-accent"
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
