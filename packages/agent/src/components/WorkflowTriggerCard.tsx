import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { Alert } from '@ui/primitives/alert';
import { Badge, type BadgeProps } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { OptionTile, OptionTileGroup } from '@ui/primitives/option-tile';
import Spinner from '@ui/primitives/spinner';
import { Zap } from 'lucide-react';
import { type ReactElement, useCallback, useRef, useState } from 'react';

import { AgentErrorMessage } from './AgentErrorMessage';

interface WorkflowTriggerCardProps {
  action: AgentUiAction;
  apiService: AgentApiService;
}

type CardStatus = 'idle' | 'triggering' | 'done' | 'error';

const STATUS_BADGE: Record<string, BadgeProps['variant']> = {
  active: 'success',
  draft: 'secondary',
  inactive: 'warning',
  paused: 'warning',
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
  const activeThreadId = useAgentChatStore((state) => state.activeThreadId);
  const activeThread = useAgentChatStore((state) =>
    state.threads.find((thread) => thread.id === state.activeThreadId),
  );

  const handleTrigger = useCallback(async () => {
    if (!selectedId) return;

    setStatus('triggering');
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await apiService.triggerWorkflow(
        selectedId,
        {},
        controller.signal,
        activeThreadId && activeThread?.contextVersion !== undefined
          ? {
              expectedContextVersion: activeThread.contextVersion,
              threadId: activeThreadId,
            }
          : undefined,
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
  }, [activeThread?.contextVersion, activeThreadId, apiService, selectedId]);

  const handleRetry = useCallback(() => {
    setStatus('idle');
    setError(null);
    setExecutionId(null);
  }, []);

  if (workflows.length === 0) {
    return (
      <div className="mt-2 overflow-hidden border border-border bg-background">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Zap className="size-4 text-primary" />
          <span className="text-sm font-medium text-foreground">
            {action.title}
          </span>
        </div>
        <div className="p-4 text-center">
          <p className="mb-2 text-sm text-muted-foreground">
            No workflows found
          </p>
          <a
            href={href(APP_ROUTES.AUTOMATION.WORKFLOWS)}
            className="text-xs font-medium text-primary underline-offset-2 hover:underline"
          >
            Create a workflow →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 overflow-hidden border border-border bg-background">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Zap className="size-4 text-primary" />
        <span className="text-sm font-medium text-foreground">
          {action.title}
        </span>
      </div>

      <div className="space-y-3 p-3">
        <OptionTileGroup
          ariaLabel={action.title}
          columns={1}
          isDisabled={status !== 'idle'}
          onValueChange={setSelectedId}
          value={selectedId ?? undefined}
        >
          {workflows.map((wf) => (
            <OptionTile
              description={wf.description}
              key={wf.id}
              size="sm"
              title={wf.name}
              trailing={
                wf.status ? (
                  <Badge
                    variant={STATUS_BADGE[wf.status] ?? STATUS_BADGE.draft}
                  >
                    {wf.status}
                  </Badge>
                ) : undefined
              }
              value={wf.id}
            />
          ))}
        </OptionTileGroup>

        {/* Trigger button */}
        {status === 'idle' && (
          <Button
            variant={ButtonVariant.DEFAULT}
            onClick={handleTrigger}
            isDisabled={!selectedId}
            className="w-full"
          >
            <Zap className="size-4" />
            Run Workflow
          </Button>
        )}

        {/* Triggering state */}
        {status === 'triggering' && (
          <div className="flex items-center justify-center gap-2 border border-border px-4 py-3">
            <Spinner className="size-4 text-primary" />
            <span className="text-sm text-muted-foreground">
              Starting workflow…
            </span>
          </div>
        )}

        {/* Done state */}
        {status === 'done' && (
          <div className="space-y-2">
            <Alert size="sm" variant="success">
              Workflow started successfully
            </Alert>
            {executionId && (
              <a
                href={href(`${APP_ROUTES.AUTOMATION.RUNS}/${executionId}`)}
                className="flex w-full items-center justify-center gap-1 border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
              >
                View Execution →
              </a>
            )}
          </div>
        )}

        {/* Error state */}
        {status === 'error' && (
          <div className="space-y-2">
            <AgentErrorMessage
              message={error ?? 'Failed to trigger workflow'}
            />
            <Button
              variant={ButtonVariant.SECONDARY}
              onClick={handleRetry}
              className="w-full"
            >
              Try Again
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
