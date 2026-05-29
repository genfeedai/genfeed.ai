'use client';

import type { AgentStrategyFormState } from '@props/automation/agent-strategies-page.props';
import { Checkbox } from '@ui/primitives/checkbox';
import type { Dispatch, SetStateAction } from 'react';

interface AgentStrategySourceTogglesProps {
  form: AgentStrategyFormState;
  setForm: Dispatch<SetStateAction<AgentStrategyFormState>>;
}

export default function AgentStrategySourceToggles({
  form,
  setForm,
}: AgentStrategySourceTogglesProps) {
  return (
    <div className="grid gap-3 rounded-lg border border-white/10 p-4 md:grid-cols-2">
      <span className="flex items-center gap-3 text-sm text-foreground">
        <Checkbox
          checked={form.trendWatchersEnabled}
          onCheckedChange={(checked) =>
            setForm((prev) => ({
              ...prev,
              trendWatchersEnabled: checked === true,
            }))
          }
          aria-label="Enable trend watchers"
        />
        Trend watchers
      </span>

      <span className="flex items-center gap-3 text-sm text-foreground">
        <Checkbox
          checked={form.eventTriggersEnabled}
          onCheckedChange={(checked) =>
            setForm((prev) => ({
              ...prev,
              eventTriggersEnabled: checked === true,
            }))
          }
          aria-label="Enable event triggers"
        />
        Event triggers
      </span>

      <span className="flex items-center gap-3 text-sm text-foreground">
        <Checkbox
          checked={form.evergreenCadenceEnabled}
          onCheckedChange={(checked) =>
            setForm((prev) => ({
              ...prev,
              evergreenCadenceEnabled: checked === true,
            }))
          }
          aria-label="Enable evergreen cadence"
        />
        Evergreen cadence
      </span>

      <span className="flex items-center gap-3 text-sm text-foreground">
        <Checkbox
          checked={form.dailyDigestEnabled}
          onCheckedChange={(checked) =>
            setForm((prev) => ({
              ...prev,
              dailyDigestEnabled: checked === true,
            }))
          }
          aria-label="Enable daily digest"
        />
        Daily digest
      </span>

      <span className="flex items-center gap-3 text-sm text-foreground">
        <Checkbox
          checked={form.weeklySummaryEnabled}
          onCheckedChange={(checked) =>
            setForm((prev) => ({
              ...prev,
              weeklySummaryEnabled: checked === true,
            }))
          }
          aria-label="Enable weekly summary"
        />
        Weekly summary
      </span>
    </div>
  );
}
