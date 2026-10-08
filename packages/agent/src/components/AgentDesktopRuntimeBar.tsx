'use client';

import { AgentRuntimeSelector } from '@genfeedai/agent/components/AgentRuntimeSelector';
import type { AgentRuntimeSelection } from '@genfeedai/agent/hooks/use-agent-runtime-selection';
import type { ReactElement } from 'react';

interface AgentDesktopRuntimeBarProps {
  selection: AgentRuntimeSelection;
}

/**
 * Shared runtime picker for Desktop, with actionable CLI readiness warnings.
 */
export function AgentDesktopRuntimeBar({
  selection,
}: AgentDesktopRuntimeBarProps): ReactElement {
  const { catalog, onRuntimeChange, runtimeNotice, selectedRuntime } =
    selection;

  return (
    <div
      className="flex min-w-0 flex-col items-start gap-1"
      data-testid="agent-desktop-runtime-bar"
    >
      <AgentRuntimeSelector
        environmentLabel={catalog.environmentLabel}
        localToolSummary={catalog.localToolSummary}
        options={catalog.options}
        providerSummary={catalog.providerSummary}
        selectedRuntime={selectedRuntime}
        onRuntimeChange={onRuntimeChange}
      />
      {runtimeNotice ? (
        <p
          className="min-w-0 text-2xs text-warning"
          data-testid="agent-desktop-runtime-notice"
        >
          {runtimeNotice}
        </p>
      ) : null}
    </div>
  );
}
