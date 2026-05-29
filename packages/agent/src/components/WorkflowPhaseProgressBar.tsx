import { PhaseProgress } from '@genfeedai/agent/workflow/components/PhaseProgress';
import { useAgentWorkflowStore } from '@genfeedai/agent/workflow/store';
import type { ReactElement } from 'react';

export function WorkflowPhaseProgressBar(): ReactElement | null {
  const phase = useAgentWorkflowStore((s) => s.phase);
  if (
    phase === 'exploring' &&
    useAgentWorkflowStore.getState().transitions.length === 0
  ) {
    return null;
  }
  return (
    <div className="mb-4">
      <PhaseProgress />
    </div>
  );
}
