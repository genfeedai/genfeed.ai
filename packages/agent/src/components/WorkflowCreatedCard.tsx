import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { type ReactElement, useCallback, useState } from 'react';
import {
  HiArrowTopRightOnSquare,
  HiCheckCircle,
  HiClock,
} from 'react-icons/hi2';

interface WorkflowCreatedCardProps {
  action: AgentUiAction;
  onUiAction?: (
    action: string,
    payload?: Record<string, unknown>,
  ) => void | Promise<void>;
}

export function WorkflowCreatedCard({
  action,
  onUiAction,
}: WorkflowCreatedCardProps): ReactElement {
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [completedAction, setCompletedAction] = useState<string | null>(null);

  const handleActionClick = useCallback(
    async (actionName: string, payload?: Record<string, unknown>) => {
      if (!onUiAction || pendingAction || completedAction === actionName) {
        return;
      }

      setPendingAction(actionName);

      try {
        await onUiAction(actionName, payload);
        setCompletedAction(actionName);
      } catch {
        // The chat container already surfaces action failures.
      } finally {
        setPendingAction(null);
      }
    },
    [completedAction, onUiAction, pendingAction],
  );

  return (
    <div className="my-2 overflow-hidden border border-emerald-500/20 bg-background">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <HiCheckCircle className="h-5 w-5 text-emerald-500" />
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
              <HiClock className="h-3.5 w-3.5" />
              <span>{action.scheduleSummary}</span>
            </div>
          ) : null}
          {action.nextRunAt ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Next run: {new Date(action.nextRunAt).toLocaleString()}
            </p>
          ) : null}
        </div>

        {(action.ctas?.length ?? 0) > 0 ? (
          <div className="flex flex-wrap gap-2">
            {action.ctas?.map((cta, index) => {
              if (cta.href) {
                return (
                  <Link
                    key={`${action.id}-workflow-created-cta-${index}`}
                    href={cta.href}
                    className="inline-flex items-center gap-1.5 border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                  >
                    <span>{cta.label}</span>
                    <HiArrowTopRightOnSquare className="h-3.5 w-3.5" />
                  </Link>
                );
              }

              if (!cta.action) {
                return null;
              }

              const actionName = cta.action;
              const isPending = pendingAction === actionName;
              const isCompleted = completedAction === actionName;
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
                  key={`${action.id}-workflow-created-action-${index}`}
                  variant={ButtonVariant.UNSTYLED}
                  withWrapper={false}
                  isDisabled={isPending || isCompleted}
                  onClick={() => {
                    void handleActionClick(actionName, cta.payload);
                  }}
                  className="inline-flex items-center gap-1.5 bg-emerald-500 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
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
