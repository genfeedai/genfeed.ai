import { useAgentUiActionRequest } from '@genfeedai/agent/hooks/use-agent-ui-action-request';
import type {
  AgentUiAction,
  AgentUiActionHandler,
} from '@genfeedai/agent/models/agent-chat.model';
import { ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import { CircleCheck, Clock, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { type ReactElement, useCallback } from 'react';

interface WorkflowCreatedCardProps {
  action: AgentUiAction;
  onUiAction?: AgentUiActionHandler;
}

export function WorkflowCreatedCard({
  action,
  onUiAction,
}: WorkflowCreatedCardProps): ReactElement {
  const request = useAgentUiActionRequest(onUiAction);
  const isAnyInFlight = (action.ctas ?? []).some((cta) => {
    if (!cta.action) return false;
    const phase = request.getPhase(cta.action, cta.payload);
    return phase === 'running' || phase === 'awaiting';
  });

  const handleActionClick = useCallback(
    async (actionName: string, payload?: Record<string, unknown>) => {
      if (
        !onUiAction ||
        isAnyInFlight ||
        request.getPhase(actionName, payload) === 'completed'
      ) {
        return;
      }
      await request.submit(actionName, payload);
    },
    [isAnyInFlight, onUiAction, request],
  );

  return (
    <div className="my-2 overflow-hidden border border-success/20 bg-background">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <CircleCheck className="size-5 text-emerald-500" />
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            {action.title || 'Automation created'}
          </h3>
          {action.description ? (
            <p className="text-xs text-muted-foreground">
              {action.description}
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div className="border border-border bg-card/40 p-3">
          <div className="text-sm font-medium text-foreground">
            {action.workflowName || 'Recurring automation'}
          </div>
          {action.scheduleSummary ? (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="size-3.5" />
              <span>{action.scheduleSummary}</span>
            </div>
          ) : null}
          {action.nextRunAt ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Next run:{' '}
              {new Date(action.nextRunAt).toLocaleString('en-US', {
                timeZone: 'UTC',
              })}
            </p>
          ) : null}
        </div>

        {(action.ctas?.length ?? 0) > 0 ? (
          <div className="flex flex-wrap gap-2">
            {action.ctas?.map((cta) => {
              if (cta.href) {
                return (
                  <Link
                    key={`${action.id}-workflow-created-cta-${cta.label}`}
                    href={cta.href}
                    className="inline-flex items-center gap-1.5 border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                  >
                    <span>{cta.label}</span>
                    <ExternalLink className="size-3.5" />
                  </Link>
                );
              }

              if (!cta.action) {
                return null;
              }

              const actionName = cta.action;
              const phase = request.getPhase(cta.action, cta.payload);
              const isPending = phase === 'running' || phase === 'awaiting';
              const isCompleted = phase === 'completed';
              const isInstallAction =
                actionName === 'confirm_install_official_workflow';
              const buttonLabel = isPending
                ? isInstallAction
                  ? 'Installing...'
                  : 'Working...'
                : isCompleted
                  ? isInstallAction
                    ? 'Installed'
                    : cta.label
                  : cta.label;

              return (
                <Button
                  key={`${action.id}-workflow-created-action-${cta.label}`}
                  variant={ButtonVariant.UNSTYLED}
                  withWrapper={false}
                  isDisabled={isPending || isCompleted}
                  onClick={() => {
                    void handleActionClick(actionName, cta.payload);
                  }}
                  className="inline-flex items-center gap-1.5 bg-success px-3 py-2 text-xs font-medium text-success-foreground transition-colors hover:bg-success/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span>{buttonLabel}</span>
                </Button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
