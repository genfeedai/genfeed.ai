'use client';

import type { AgentStrategyFormState } from '@props/automation/agent-strategies-page.props';
import { Checkbox } from '@ui/primitives/checkbox';
import type { Dispatch, SetStateAction } from 'react';

interface AgentStrategyPublishTogglesProps {
  form: AgentStrategyFormState;
  setForm: Dispatch<SetStateAction<AgentStrategyFormState>>;
}

export default function AgentStrategyPublishToggles({
  form,
  setForm,
}: AgentStrategyPublishTogglesProps) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-white/10 p-4">
      <span className="flex items-center gap-3 text-sm text-foreground">
        <Checkbox
          checked={form.autoPublishEnabled}
          onCheckedChange={(checked) =>
            setForm((prev) => ({
              ...prev,
              autoPublishEnabled: checked === true,
            }))
          }
          aria-label="Enable autopilot auto publish"
        />
        Enforce autopilot publish gate before auto-publishing text drafts
      </span>

      <span className="flex items-center gap-3 text-sm text-foreground">
        <Checkbox
          checked={form.isEnabled}
          onCheckedChange={(checked) =>
            setForm((prev) => ({
              ...prev,
              isEnabled: checked === true,
            }))
          }
          aria-label="Enable strategy"
        />
        Enabled for scheduling
      </span>

      <span className="flex items-center gap-3 text-sm text-foreground">
        <Checkbox
          checked={form.isActive}
          onCheckedChange={(checked) =>
            setForm((prev) => ({
              ...prev,
              isActive: checked === true,
            }))
          }
          aria-label="Mark strategy active"
        />
        Active and ready to run
      </span>
    </div>
  );
}
