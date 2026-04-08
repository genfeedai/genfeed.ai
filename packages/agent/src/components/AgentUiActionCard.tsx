import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import type { ReactElement } from 'react';

interface AgentUiActionCardProps {
  action: AgentUiAction;
}

export function AgentUiActionCard({
  action,
}: AgentUiActionCardProps): ReactElement {
  return (
    <div className="my-1.5 border border-border bg-background p-2.5 text-xs">
      <div className="flex items-center gap-2">
        <span className="font-medium text-foreground">{action.title}</span>
        {action.riskLevel && action.riskLevel !== 'low' && (
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] ${
              action.riskLevel === 'high'
                ? 'bg-red-100 text-red-700'
                : 'bg-amber-100 text-amber-700'
            }`}
          >
            {action.riskLevel}
          </span>
        )}
      </div>
      {action.description && (
        <p className="mt-1 text-muted-foreground">{action.description}</p>
      )}
      {action.ctas && action.ctas.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {action.ctas.map((cta, idx) => {
            if (cta.href) {
              return (
                <a
                  key={`${action.id}-cta-${idx}`}
                  href={cta.href}
                  className="inline-flex items-center border border-border px-2 py-1 text-xs hover:bg-accent"
                >
                  {cta.label}
                </a>
              );
            }

            return (
              <Button
                key={`${action.id}-cta-${idx}`}
                variant={ButtonVariant.SECONDARY}
                className="h-auto px-2 py-1 text-xs"
                isDisabled
              >
                {cta.label}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
