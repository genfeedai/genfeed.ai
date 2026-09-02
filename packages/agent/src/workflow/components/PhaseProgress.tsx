import { ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { Check, ChevronRight, Circle, Lock } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { getPhaseIndex } from '../machine';
import { useAgentWorkflowStore } from '../store';
import { PHASE_LABELS, WORKFLOW_PHASES, type WorkflowPhase } from '../types';

function PhaseStep({
  phase,
  currentPhase,
  onRollback,
}: {
  phase: WorkflowPhase;
  currentPhase: WorkflowPhase;
  onRollback: (phase: WorkflowPhase) => void;
}) {
  const currentIndex = getPhaseIndex(currentPhase);
  const stepIndex = getPhaseIndex(phase);
  const isComplete = stepIndex < currentIndex;
  const isCurrent = phase === currentPhase;
  const isFuture = stepIndex > currentIndex;
  const canRollback = isComplete && currentPhase !== 'complete';

  return (
    <Button
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
      onClick={() => canRollback && onRollback(phase)}
      isDisabled={!canRollback}
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all',
        isComplete &&
          'bg-success/10 text-success hover:bg-success/10 cursor-pointer',
        isCurrent &&
          'bg-foreground/10 text-foreground ring-1 ring-foreground/20',
        isFuture && 'text-foreground/30',
        canRollback && 'hover:ring-1 hover:ring-emerald-500/30',
      )}
    >
      <span
        className={cn(
          'flex items-center justify-center size-6 rounded-full text-xs',
          isComplete && 'bg-success/10',
          isCurrent && 'bg-foreground/15',
          isFuture && 'bg-foreground/5',
        )}
      >
        {isComplete ? (
          <Check className="size-3.5" />
        ) : isCurrent ? (
          <Circle className="size-3 fill-current" />
        ) : (
          <span>{stepIndex + 1}</span>
        )}
      </span>
      <span className="hidden sm:inline">{PHASE_LABELS[phase]}</span>
    </Button>
  );
}

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
        {WORKFLOW_PHASES.map((p, i) => (
          <div key={p} className="flex items-center">
            <PhaseStep
              phase={p}
              currentPhase={phase}
              onRollback={handleRollback}
            />
            {i < WORKFLOW_PHASES.length - 1 && (
              <ChevronRight className="size-4 text-foreground/20 shrink-0 mx-0.5" />
            )}
          </div>
        ))}
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
              className="px-3 py-1.5 text-sm font-medium bg-warning/10 text-warning rounded-md hover:bg-warning/30 transition-colors"
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
