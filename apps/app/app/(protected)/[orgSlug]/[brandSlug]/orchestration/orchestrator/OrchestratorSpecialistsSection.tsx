import type { AgentStrategy } from '@services/automation/agent-strategies.service';
import { Checkbox } from '@ui/primitives/checkbox';

type Props = {
  selectedStrategyIds: string[];
  strategies: AgentStrategy[];
  toggleStrategy: (strategyId: string) => void;
};

export default function OrchestratorSpecialistsSection({
  selectedStrategyIds,
  strategies,
  toggleStrategy,
}: Props) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">
        Existing Specialists
      </p>
      <div className="space-y-2 rounded border border-white/[0.08] p-4">
        {strategies.length === 0 ? (
          <p className="text-sm text-foreground/50">
            No existing strategies found. The blueprint can still create the
            initial team.
          </p>
        ) : (
          strategies.map((strategy) => (
            <span
              key={strategy.id}
              className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-white/[0.06] px-3 py-2"
            >
              <div>
                <p className="text-sm font-medium text-foreground">
                  {strategy.label}
                </p>
                <p className="text-xs text-foreground/50">
                  {strategy.displayRole ?? strategy.agentType}
                </p>
              </div>
              <Checkbox
                aria-label={`Select ${strategy.label}`}
                checked={selectedStrategyIds.includes(strategy.id)}
                onCheckedChange={() => toggleStrategy(strategy.id)}
              />
            </span>
          ))
        )}
      </div>
    </div>
  );
}
