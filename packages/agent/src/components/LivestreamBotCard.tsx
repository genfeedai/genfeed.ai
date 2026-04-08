import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { type ReactElement, useCallback, useState } from 'react';
import {
  HiArrowTopRightOnSquare,
  HiChatBubbleLeftRight,
  HiCheckCircle,
} from 'react-icons/hi2';

interface LivestreamBotCardProps {
  action: AgentUiAction;
  onUiAction?: (
    action: string,
    payload?: Record<string, unknown>,
  ) => void | Promise<void>;
}

export function LivestreamBotCard({
  action,
  onUiAction,
}: LivestreamBotCardProps): ReactElement {
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
      } finally {
        setPendingAction(null);
      }
    },
    [completedAction, onUiAction, pendingAction],
  );

  return (
    <div className="my-2 overflow-hidden border border-sky-500/20 bg-background">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <HiChatBubbleLeftRight className="h-5 w-5 text-sky-500" />
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            {action.title || 'Livestream bot'}
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
            {action.botName || 'Livestream bot'}
          </div>
          {action.platform ? (
            <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
              {action.platform}
            </p>
          ) : null}
          {action.sessionStatus ? (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground">
              <HiCheckCircle className="h-3.5 w-3.5" />
              <span>{action.sessionStatus}</span>
            </div>
          ) : null}
        </div>

        {(action.ctas?.length ?? 0) > 0 ? (
          <div className="flex flex-wrap gap-2">
            {action.ctas?.map((cta, index) => {
              if (cta.href) {
                return (
                  <Link
                    key={`${action.id}-bot-link-${index}`}
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

              const isPending = pendingAction === cta.action;
              const isCompleted = completedAction === cta.action;
              const actionName = cta.action;

              return (
                <Button
                  key={`${action.id}-bot-action-${index}`}
                  variant={ButtonVariant.UNSTYLED}
                  withWrapper={false}
                  isDisabled={isPending || isCompleted}
                  onClick={() => {
                    void handleActionClick(actionName, cta.payload);
                  }}
                  className="inline-flex items-center gap-1.5 bg-sky-500 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span>
                    {isPending
                      ? 'Working...'
                      : isCompleted
                        ? 'Done'
                        : cta.label}
                  </span>
                </Button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
