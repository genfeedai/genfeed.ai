import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { ButtonVariant } from '@genfeedai/contracts';
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
            className={`rounded px-1.5 py-0.5 text-2xs ${
              action.riskLevel === 'high'
                ? 'bg-destructive/10 text-destructive'
                : 'bg-warning/10 text-warning'
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
          {action.ctas.map((cta) => {
            if (cta.href) {
              return (
                <a
                  key={`${action.id}-cta-${cta.label}`}
                  href={cta.href}
                  className="inline-flex items-center border border-border px-2 py-1 text-xs hover:bg-accent"
                >
                  {cta.label}
                </a>
              );
            }

            return (
              <Button
                key={`${action.id}-cta-${cta.label}`}
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
