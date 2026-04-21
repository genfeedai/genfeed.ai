'use client';

import { AgentRuntimeSelector } from '@genfeedai/agent/components/AgentRuntimeSelector';
import type {
  AgentRuntimeCatalog,
  AgentRuntimeOption,
} from '@genfeedai/agent/models/agent-runtime.model';
import { cn } from '@helpers/formatting/cn/cn.util';
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
    <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              'gen-shell-chip px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]',
              catalog.environmentLabel === 'local'
                ? 'text-success'
                : 'text-info',
            )}
            data-tone={
              catalog.environmentLabel === 'local' ? 'success' : 'info'
            }
          >
            {catalog.environmentLabel}
          </span>
          <p className="truncate font-mono text-[13px] text-foreground/72">
            {threadLabel || 'new-session'}
          </p>
        </div>
        <p className="truncate pt-1 text-[11px] text-foreground/52">
          {catalog.providerSummary}
        </p>
      </div>

      <AgentRuntimeSelector
        environmentLabel={catalog.environmentLabel}
        localToolSummary={catalog.localToolSummary}
        options={catalog.options}
        providerSummary={catalog.providerSummary}
        selectedRuntimeKey={selectedRuntime.key}
        onRuntimeChange={onRuntimeChange}
      />
    </div>
  );
}
