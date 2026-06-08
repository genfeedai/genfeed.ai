import { Input } from '@ui/primitives/input';
import type { ReactElement } from 'react';

type Props = {
  dailyCreditBudget: number;
  setDailyCreditBudget: (value: number) => void;
  weeklyCreditBudget: number;
  setWeeklyCreditBudget: (value: number) => void;
};

export function AgentStrategyBudgetSection({
  dailyCreditBudget,
  setDailyCreditBudget,
  weeklyCreditBudget,
  setWeeklyCreditBudget,
}: Props): ReactElement {
  return (
    <section className="space-y-4 border border-border p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Budget
      </h3>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label
            htmlFor="strategy-daily-budget"
            className="text-xs font-medium text-foreground"
          >
            Daily Credit Budget
          </label>
          <Input
            id="strategy-daily-budget"
            type="number"
            value={dailyCreditBudget}
            onChange={(e) => setDailyCreditBudget(Number(e.target.value))}
            min={0}
          />
        </div>

        <div className="space-y-1">
          <label
            htmlFor="strategy-weekly-budget"
            className="text-xs font-medium text-foreground"
          >
            Weekly Credit Budget
          </label>
          <Input
            id="strategy-weekly-budget"
            type="number"
            value={weeklyCreditBudget}
            onChange={(e) => setWeeklyCreditBudget(Number(e.target.value))}
            min={0}
          />
        </div>
      </div>
    </section>
  );
}
