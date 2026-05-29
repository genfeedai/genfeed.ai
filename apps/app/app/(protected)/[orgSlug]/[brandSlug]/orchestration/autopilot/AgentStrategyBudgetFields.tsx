'use client';

import type { AgentStrategyFormState } from '@props/automation/agent-strategies-page.props';
import { Input } from '@ui/primitives/input';
import type { Dispatch, SetStateAction } from 'react';

interface AgentStrategyBudgetFieldsProps {
  form: AgentStrategyFormState;
  setForm: Dispatch<SetStateAction<AgentStrategyFormState>>;
}

export default function AgentStrategyBudgetFields({
  form,
  setForm,
}: AgentStrategyBudgetFieldsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="space-y-1.5">
        <label
          className="text-sm font-medium text-foreground"
          htmlFor="strategy-daily-budget"
        >
          Daily Budget
        </label>
        <Input
          id="strategy-daily-budget"
          min={0}
          type="number"
          value={form.dailyCreditBudget}
          onChange={(event) =>
            setForm((prev) => ({
              ...prev,
              dailyCreditBudget: event.target.value,
            }))
          }
        />
      </div>

      <div className="space-y-1.5">
        <label
          className="text-sm font-medium text-foreground"
          htmlFor="strategy-credit-threshold"
        >
          Min Credits
        </label>
        <Input
          id="strategy-credit-threshold"
          min={0}
          type="number"
          value={form.minCreditThreshold}
          onChange={(event) =>
            setForm((prev) => ({
              ...prev,
              minCreditThreshold: event.target.value,
            }))
          }
        />
      </div>

      <div className="space-y-1.5">
        <label
          className="text-sm font-medium text-foreground"
          htmlFor="strategy-confidence-threshold"
        >
          Auto-publish Threshold
        </label>
        <Input
          id="strategy-confidence-threshold"
          max={1}
          min={0}
          step="0.05"
          type="number"
          value={form.autoPublishConfidenceThreshold}
          onChange={(event) =>
            setForm((prev) => ({
              ...prev,
              autoPublishConfidenceThreshold: event.target.value,
            }))
          }
        />
      </div>

      <div className="space-y-1.5">
        <label
          className="text-sm font-medium text-foreground"
          htmlFor="strategy-monthly-budget"
        >
          Monthly Budget
        </label>
        <Input
          id="strategy-monthly-budget"
          min={0}
          type="number"
          value={form.monthlyCreditBudget}
          onChange={(event) =>
            setForm((prev) => ({
              ...prev,
              monthlyCreditBudget: event.target.value,
            }))
          }
        />
      </div>
    </div>
  );
}
