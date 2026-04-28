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
    <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
      <span
        className={cn(
          'gen-shell-chip shrink-0 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em]',
          catalog.environmentLabel === 'local' ? 'text-success' : 'text-info',
        )}
        data-tone={catalog.environmentLabel === 'local' ? 'success' : 'info'}
      >
        {catalog.environmentLabel}
      </span>
      <p className="shrink-0 truncate font-mono text-[11px] uppercase tracking-[0.12em] text-foreground/55">
        {threadLabel || 'new-session'}
      </p>
      <span className="hidden h-3 w-px shrink-0 bg-foreground/15 md:block" />
      <p className="hidden truncate text-[11px] text-foreground/45 md:block">
        {catalog.providerSummary}
      </p>

      <div className="ml-auto shrink-0">
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
