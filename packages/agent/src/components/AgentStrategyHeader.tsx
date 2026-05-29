import type { AgentStrategy } from '@genfeedai/agent/models/agent-strategy.model';
import { runAgentApiEffect } from '@genfeedai/agent/services/agent-base-api.service';
import type { AgentStrategyApiService } from '@genfeedai/agent/services/agent-strategy-api.service';
import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import type { ReactElement, RefObject } from 'react';

type Props = {
  strategy: AgentStrategy | null;
  abortRef: RefObject<AbortController | null>;
  apiService: AgentStrategyApiService;
  setStrategy: (strategy: AgentStrategy) => void;
};

export function AgentStrategyHeader({
  strategy,
  abortRef,
  apiService,
  setStrategy,
}: Props): ReactElement {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-sm font-semibold text-foreground">
          Autopilot Configuration
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Configure how the AI agent creates and manages content automatically.
        </p>
      </div>
      {strategy && (
        <Button
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
          onClick={async () => {
            abortRef.current?.abort();
            abortRef.current = new AbortController();
            try {
              const updated = await runAgentApiEffect(
                apiService.toggleStrategyEffect(
                  strategy.id,
                  abortRef.current.signal,
                ),
              );
              setStrategy(updated);
            } catch {
              // Silently ignore toggle errors
            }
          }}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
            strategy.isActive ? 'bg-primary' : 'bg-muted'
          }`}
        >
          <span
            className={`pointer-events-none inline-block size-4 rounded-full bg-background shadow-sm transition-transform ${
              strategy.isActive ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </Button>
      )}
    </div>
  );
}
