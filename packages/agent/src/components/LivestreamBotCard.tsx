import { useAgentUiActionRequest } from '@genfeedai/agent/hooks/use-agent-ui-action-request';
import type {
  AgentUiAction,
  AgentUiActionHandler,
} from '@genfeedai/agent/models/agent-chat.model';
import { ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import { CircleCheck, ExternalLink, MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { type ReactElement, useCallback } from 'react';

interface LivestreamBotCardProps {
  action: AgentUiAction;
  onUiAction?: AgentUiActionHandler;
}

export function LivestreamBotCard({
  action,
  onUiAction,
}: LivestreamBotCardProps): ReactElement {
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
    <div className="my-2 overflow-hidden border border-info/20 bg-background">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <MessageSquare className="size-5 text-sky-500" />
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
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-1 text-2xs font-medium text-muted-foreground">
              <CircleCheck className="size-3.5" />
              <span>{action.sessionStatus}</span>
            </div>
          ) : null}
        </div>

        {(action.ctas?.length ?? 0) > 0 ? (
          <div className="flex flex-wrap gap-2">
            {action.ctas?.map((cta) => {
              if (cta.href) {
                return (
                  <Link
                    key={`${action.id}-bot-link-${cta.href}-${cta.label}`}
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

              const phase = request.getPhase(cta.action, cta.payload);
              const isPending = phase === 'running' || phase === 'awaiting';
              const isCompleted = phase === 'completed';
              const actionName = cta.action;

              return (
                <Button
                  key={`${action.id}-bot-action-${cta.action}-${cta.label}`}
                  variant={ButtonVariant.UNSTYLED}
                  withWrapper={false}
                  isDisabled={isPending || isCompleted}
                  onClick={() => {
                    void handleActionClick(actionName, cta.payload);
                  }}
                  className="inline-flex items-center gap-1.5 bg-info px-3 py-2 text-xs font-medium text-info-foreground transition-colors hover:bg-info/90 disabled:cursor-not-allowed disabled:opacity-60"
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
