import { cn } from '@helpers/formatting/cn/cn.util';
import {
  BookOpen,
  ChevronRight,
  Code2,
  Loader2,
  MessageCircle,
  Sparkles,
} from 'lucide-react';
import { memo } from 'react';
import { useAgentWorkflowStore } from '../store';
import type { WorkflowPhase } from '../types';
import { ApprovalPanel } from './ApprovalPanel';
import { PhaseConversation } from './PhaseConversation';
import { PhaseProgress } from './PhaseProgress';
import { PhaseTransitionLog } from './PhaseTransitionLog';
import { QuestionCard } from './QuestionCard';
import { VerificationPanel } from './VerificationPanel';

function ExploringView() {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-3">
      <div className="relative">
        <BookOpen className="size-8 text-violet-400" />
        <Loader2 className="size-4 text-violet-400 animate-spin absolute -top-1 -right-1" />
      </div>
      <p className="text-sm text-white/60 text-center max-w-xs">
        Agent is exploring context and reading relevant files...
      </p>
    </div>
  );
}

function ClarifyingView() {
  const questions = useAgentWorkflowStore((s) => s.questions);
  const answerQuestion = useAgentWorkflowStore((s) => s.answerQuestion);
  const isLocked = useAgentWorkflowStore((s) => s.isLocked);

  const currentQuestion = questions.find(
    (q) => q.answer === undefined || q.answer === '',
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <MessageCircle className="size-5 text-blue-400" />
        <h2 className="text-sm font-semibold text-white/90">
          Questions from agent
        </h2>
        <span className="text-xs text-white/40 ml-auto">
          {questions.filter((q) => q.answer).length}/{questions.length} answered
        </span>
      </div>

      {currentQuestion ? (
        <QuestionCard
          question={currentQuestion}
          onAnswer={answerQuestion}
          disabled={isLocked}
        />
      ) : questions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/10 p-6 text-center">
          <p className="text-sm text-white/40">
            Waiting for agent to ask questions...
          </p>
        </div>
      ) : (
        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-4 text-center">
          <p className="text-sm text-emerald-400">
            All questions answered. Agent will propose approaches next.
          </p>
        </div>
      )}

      {/* Show previously answered questions */}
      {questions.filter((q) => q.answer && q.id !== currentQuestion?.id)
        .length > 0 && (
        <div className="space-y-2 opacity-60">
          {questions
            .filter((q) => q.answer && q.id !== currentQuestion?.id)
            .map((q) => (
              <QuestionCard
                key={q.id}
                question={q}
                onAnswer={answerQuestion}
                disabled
              />
            ))}
        </div>
      )}
    </div>
  );
}

function ProposingView() {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-3">
      <Sparkles className="size-8 text-amber-400" />
      <p className="text-sm text-white/60 text-center max-w-xs">
        Agent is crafting approaches based on your answers...
      </p>
    </div>
  );
}

function ImplementingView() {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-3">
      <div className="relative">
        <Code2 className="size-8 text-blue-400" />
        <Loader2 className="size-4 text-blue-400 animate-spin absolute -top-1 -right-1" />
      </div>
      <p className="text-sm text-white/60 text-center max-w-xs">
        Agent is implementing the approved approach...
      </p>
    </div>
  );
}

function CompleteView() {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-3">
      <div className="size-12 rounded-full bg-emerald-500/15 flex items-center justify-center">
        <Sparkles className="size-6 text-emerald-400" />
      </div>
      <p className="text-sm font-medium text-emerald-400">Workflow complete</p>
      <p className="text-xs text-white/40 text-center max-w-xs">
        All phases finished. Review the transition log for the full audit trail.
      </p>
    </div>
  );
}

const PHASE_VIEWS: Record<WorkflowPhase, React.ComponentType> = {
  awaiting_approval: ApprovalPanel,
  clarifying: ClarifyingView,
  complete: CompleteView,
  exploring: ExploringView,
  implementing: ImplementingView,
  proposing: ProposingView,
  verifying: VerificationPanel,
};

function AgentWorkflowInner() {
  const phase = useAgentWorkflowStore((s) => s.phase);
  const canAdvance = useAgentWorkflowStore((s) => s.canAdvance());
  const advance = useAgentWorkflowStore((s) => s.advance);
  const forceAdvance = useAgentWorkflowStore((s) => s.forceAdvance);
  const isLocked = useAgentWorkflowStore((s) => s.isLocked);

  const PhaseView = PHASE_VIEWS[phase];
  const showForceAdvance = !canAdvance && phase !== 'complete' && !isLocked;

  return (
    <div className="flex flex-col gap-4 w-full max-w-2xl mx-auto">
      <PhaseProgress />

      <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-4">
        <PhaseView />
      </div>

      {/* Manual controls */}
      {phase !== 'complete' && (
        <div className="flex items-center gap-2 justify-end">
          {showForceAdvance && (
            <button
              type="button"
              onClick={forceAdvance}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium',
                'text-amber-400/70 hover:text-amber-400 transition-colors',
                'border border-amber-500/20 rounded-lg hover:bg-amber-500/10',
              )}
            >
              <ChevronRight className="size-3" />
              Force advance
            </button>
          )}
          {canAdvance &&
            phase !== 'awaiting_approval' &&
            phase !== 'verifying' && (
              <button
                type="button"
                onClick={() => advance('user')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-400 border border-emerald-500/20 rounded-lg hover:bg-emerald-500/10 transition-colors"
              >
                <ChevronRight className="size-3" />
                Advance
              </button>
            )}
        </div>
      )}

      <PhaseConversation />
      <PhaseTransitionLog />
    </div>
  );
}

export const AgentWorkflow = memo(AgentWorkflowInner);
