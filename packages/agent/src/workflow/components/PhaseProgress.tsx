import { ButtonVariant } from '@genfeedai/enums';
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
          'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 cursor-pointer',
        isCurrent && 'bg-white/10 text-white ring-1 ring-white/20',
        isFuture && 'text-white/30',
        canRollback && 'hover:ring-1 hover:ring-emerald-500/30',
      )}
    >
      <span
        className={cn(
          'flex items-center justify-center size-6 rounded-full text-xs',
          isComplete && 'bg-emerald-500/20',
          isCurrent && 'bg-white/15',
          isFuture && 'bg-white/5',
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
      <div className="flex items-center gap-1 overflow-x-auto p-2 rounded-xl bg-white/5 border border-white/10">
        {isLocked && <Lock className="size-4 text-amber-400 shrink-0 mr-1" />}
        {WORKFLOW_PHASES.map((p, i) => (
          <div key={p} className="flex items-center">
            <PhaseStep
              phase={p}
              currentPhase={phase}
              onRollback={handleRollback}
            />
            {i < WORKFLOW_PHASES.length - 1 && (
              <ChevronRight className="size-4 text-white/20 shrink-0 mx-0.5" />
            )}
          </div>
        ))}
      </div>

      {confirmTarget && (
        <div className="absolute top-full left-0 right-0 mt-2 p-3 rounded-lg bg-zinc-900 border border-white/10 shadow-lg z-10">
          <p className="text-sm text-white/70 mb-2">
            Roll back to{' '}
            <span className="text-white font-medium">
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
              className="px-3 py-1.5 text-sm font-medium bg-amber-500/20 text-amber-400 rounded-md hover:bg-amber-500/30 transition-colors"
            >
              Confirm rollback
            </Button>
            <Button
              variant={ButtonVariant.GHOST}
              onClick={() => setConfirmTarget(null)}
              className="px-3 py-1.5 text-sm text-white/50 hover:text-white/70"
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
