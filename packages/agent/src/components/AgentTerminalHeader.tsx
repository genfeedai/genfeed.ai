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
        aria-hidden="true"
        className={cn(
          'inline-flex h-1.5 w-1.5 shrink-0 rounded-full',
          catalog.environmentLabel === 'local'
            ? 'bg-emerald-400'
            : 'bg-sky-400',
        )}
      />
      <span className="sr-only">{catalog.environmentLabel}</span>
      <p className="shrink-0 truncate text-[11px] text-foreground/55">
        {threadLabel || 'New session'}
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
