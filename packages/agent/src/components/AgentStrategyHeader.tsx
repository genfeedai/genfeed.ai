import type { AgentStrategy } from '@genfeedai/agent/models/agent-strategy.model';
import type { AgentStrategyApiService } from '@genfeedai/agent/services/agent-strategy-api.service';
import { Switch } from '@ui/primitives/switch';
import { useTranslations } from 'next-intl';
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
  const translate = useTranslations('agent.strategyStatus');
  return (
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-sm font-semibold text-foreground">
          Agent settings
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Configure how the AI agent creates and manages content automatically.
        </p>
      </div>
      {strategy && (
        <Switch
          aria-label={translate('enableStrategy')}
          isChecked={strategy.isActive}
          onCheckedChange={async () => {
            abortRef.current?.abort();
            abortRef.current = new AbortController();
            try {
              const updated = await apiService.toggleStrategy(
                strategy.id,
                abortRef.current.signal,
              );
              setStrategy(updated);
            } catch {
              // Silently ignore toggle errors
            }
          }}
        />
      )}
    </div>
  );
}
