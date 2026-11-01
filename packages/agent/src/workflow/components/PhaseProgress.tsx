import { ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import { Stepper } from '@ui/primitives/stepper';
import { Lock } from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';
import { getPhaseIndex } from '../machine';
import { useAgentWorkflowStore } from '../store';
import { PHASE_LABELS, WORKFLOW_PHASES, type WorkflowPhase } from '../types';

function PhaseProgressInner() {
  const phase = useAgentWorkflowStore((s) => s.phase);
  const isLocked = useAgentWorkflowStore((s) => s.isLocked);
  const rollback = useAgentWorkflowStore((s) => s.rollback);
  const [confirmTarget, setConfirmTarget] = useState<WorkflowPhase | null>(
    null,
  );

  const handleRollback = useCallback(
    (target: WorkflowPhase) => {
      if (isLocked) return;
      setConfirmTarget(target);
    },
    [isLocked],
  );

  const currentIndex = getPhaseIndex(phase);
  const steps = useMemo(
    () =>
      WORKFLOW_PHASES.map((p, index) => ({
        id: p,
        isDisabled: index >= currentIndex || phase === 'complete',
        label: PHASE_LABELS[p],
      })),
    [currentIndex, phase],
  );

  const confirmRollback = useCallback(() => {
    if (confirmTarget) {
      rollback(confirmTarget);
      setConfirmTarget(null);
    }
  }, [confirmTarget, rollback]);

  return (
    <div className="relative">
      <div className="flex items-center gap-1 overflow-x-auto p-2 rounded-xl bg-foreground/5 border border-foreground/10">
        {isLocked && <Lock className="size-4 text-warning shrink-0 mr-1" />}
        <Stepper
          className="flex-1 gap-1"
          currentStep={currentIndex}
          onStepSelect={(index) => handleRollback(WORKFLOW_PHASES[index])}
          steps={steps}
        />
      </div>

      {confirmTarget && (
        <div className="absolute top-full left-0 right-0 mt-2 p-3 rounded-lg bg-zinc-900 border border-foreground/10 shadow-lg z-10">
          <p className="text-sm text-foreground/70 mb-2">
            Roll back to{' '}
            <span className="font-medium text-foreground">
              {PHASE_LABELS[confirmTarget]}
            </span>
            ? Progress in later phases will be preserved but you'll need to
            re-advance through gates.
          </p>
          <div className="flex gap-2">
            <Button
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              onClick={confirmRollback}
              className="px-3 py-1.5 text-sm font-medium bg-warning/10 text-warning rounded-md hover:bg-warning/20 transition-colors"
            >
              Confirm rollback
            </Button>
            <Button
              variant={ButtonVariant.GHOST}
              onClick={() => setConfirmTarget(null)}
              className="px-3 py-1.5 text-sm text-foreground/50 hover:text-foreground/70"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export const PhaseProgress = memo(PhaseProgressInner);
