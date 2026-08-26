'use client';

import { AgentRuntimeSelector } from '@genfeedai/agent/components/AgentRuntimeSelector';
import type {
  AgentRuntimeCatalog,
  AgentRuntimeOption,
} from '@genfeedai/agent/models/agent-runtime.model';
import type { ReactElement } from 'react';

interface AgentTerminalHeaderProps {
  catalog: AgentRuntimeCatalog;
  selectedRuntime: AgentRuntimeOption;
  threadLabel?: string | null;
  onRuntimeChange: (runtime: AgentRuntimeOption) => void;
}

export function AgentTerminalHeader({
  catalog,
  selectedRuntime,
  threadLabel,
  onRuntimeChange,
}: AgentTerminalHeaderProps): ReactElement {
  return (
    <div className="flex min-w-0 shrink-0 items-center gap-2 overflow-hidden">
      <span className="shrink-0 text-2xs capitalize leading-none text-foreground/55">
        {catalog.environmentLabel}
      </span>
      <p className="shrink-0 self-center truncate text-2xs leading-none text-foreground/55">
        {threadLabel || 'New session'}
      </p>

      <div className="shrink-0">
        <AgentRuntimeSelector
          environmentLabel={catalog.environmentLabel}
          localToolSummary={catalog.localToolSummary}
          options={catalog.options}
          providerSummary={catalog.providerSummary}
          selectedRuntimeKey={selectedRuntime.key}
          onRuntimeChange={onRuntimeChange}
        />
      </div>
    </div>
  );
}
