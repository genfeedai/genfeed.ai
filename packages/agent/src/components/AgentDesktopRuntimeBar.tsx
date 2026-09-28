'use client';

import { AgentRuntimeSelector } from '@genfeedai/agent/components/AgentRuntimeSelector';
import type { AgentRuntimeSelection } from '@genfeedai/agent/hooks/use-agent-runtime-selection';
import type { ReactElement } from 'react';

interface AgentDesktopRuntimeBarProps {
  selection: AgentRuntimeSelection;
}

/**
 * Composer runtime picker shown in Genfeed Desktop when a local Claude Code
 * or Codex CLI is installed, with a plain statement of who pays for the turn
 * and how to update a CLI too old to run turns.
 */
export function AgentDesktopRuntimeBar({
  selection,
}: AgentDesktopRuntimeBarProps): ReactElement {
  const { catalog, onRuntimeChange, runtimeNotice, selectedRuntime } =
    selection;

  return (
    <div
      className="flex min-w-0 items-center gap-2"
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
      <p
        className={
          selectedRuntime.hint
            ? 'min-w-0 truncate text-2xs text-success'
            : 'min-w-0 truncate text-2xs text-foreground/48'
        }
      >
        {selectedRuntime.hint ?? 'Runs on Genfeed — uses Genfeed credits'}
      </p>
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
