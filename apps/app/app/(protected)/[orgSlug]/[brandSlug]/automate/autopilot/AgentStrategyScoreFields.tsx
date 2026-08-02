'use client';

import type { AgentStrategyFormState } from '@props/automation/agent-strategies-page.props';
import { Input } from '@ui/primitives/input';
import type { Dispatch, SetStateAction } from 'react';

interface AgentStrategyScoreFieldsProps {
  form: AgentStrategyFormState;
  setForm: Dispatch<SetStateAction<AgentStrategyFormState>>;
}

export default function AgentStrategyScoreFields({
  form,
  setForm,
}: AgentStrategyScoreFieldsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="space-y-1.5">
        <label
          className="text-sm font-medium text-foreground"
          htmlFor="strategy-trend-reserve"
        >
          Trend Reserve
        </label>
        <Input
          id="strategy-trend-reserve"
          min={0}
          type="number"
          value={form.reserveTrendBudget}
          onChange={(event) =>
            setForm((prev) => ({
              ...prev,
              reserveTrendBudget: event.target.value,
            }))
          }
        />
      </div>

      <div className="space-y-1.5">
        <label
          className="text-sm font-medium text-foreground"
          htmlFor="strategy-min-post-score"
        >
          Min Post Score
        </label>
        <Input
          id="strategy-min-post-score"
          max={100}
          min={0}
          type="number"
          value={form.minPostScore}
          onChange={(event) =>
            setForm((prev) => ({
              ...prev,
              minPostScore: event.target.value,
            }))
          }
        />
      </div>

      <div className="space-y-1.5">
        <label
          className="text-sm font-medium text-foreground"
          htmlFor="strategy-min-image-score"
        >
          Min Image Score
        </label>
        <Input
          id="strategy-min-image-score"
          max={100}
          min={0}
          type="number"
          value={form.minImageScore}
          onChange={(event) =>
            setForm((prev) => ({
              ...prev,
              minImageScore: event.target.value,
            }))
          }
        />
      </div>
    </div>
  );
}
