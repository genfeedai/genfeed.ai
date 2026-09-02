import { ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import {
  BookOpen,
  ChevronRight,
  CodeXml,
  LoaderCircle,
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
        <BookOpen className="size-8 text-primary" />
        <LoaderCircle className="size-4 text-primary animate-spin absolute -top-1 -right-1" />
      </div>
      <p className="text-sm text-foreground/60 text-center max-w-xs">
        Agent is exploring context and reading relevant files…
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
        <MessageCircle className="size-5 text-info" />
        <h2 className="text-sm font-semibold text-foreground/90">
          Questions from agent
        </h2>
        <span className="text-xs text-foreground/40 ml-auto">
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
        <div className="rounded-lg border border-dashed border-foreground/10 p-6 text-center">
          <p className="text-sm text-foreground/40">
            Waiting for agent to ask questions…
          </p>
        </div>
      ) : (
        <div className="rounded-lg bg-success/10 border border-success/20 p-4 text-center">
          <p className="text-sm text-success">
            All questions answered. Agent will propose approaches next.
          </p>
        </div>
      )}

      {/* Show previously answered questions */}
      {(() => {
        const answeredQuestions = questions.filter(
          (q) => q.answer && q.id !== currentQuestion?.id,
        );
        return answeredQuestions.length > 0 ? (
          <div className="space-y-2 opacity-60">
            {answeredQuestions.map((q) => (
              <QuestionCard
                key={q.id}
                question={q}
                onAnswer={answerQuestion}
                disabled
              />
            ))}
          </div>
        ) : null;
      })()}
    </div>
  );
}

function ProposingView() {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-3">
      <Sparkles className="size-8 text-warning" />
      <p className="text-sm text-foreground/60 text-center max-w-xs">
        Agent is crafting approaches based on your answers…
      </p>
    </div>
  );
}

function ImplementingView() {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-3">
      <div className="relative">
        <CodeXml className="size-8 text-info" />
        <LoaderCircle className="size-4 text-info animate-spin absolute -top-1 -right-1" />
      </div>
      <p className="text-sm text-foreground/60 text-center max-w-xs">
        Agent is implementing the approved approach…
      </p>
    </div>
  );
}

function CompleteView() {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-3">
      <div className="size-12 rounded-full bg-success/10 flex items-center justify-center">
        <Sparkles className="size-6 text-success" />
      </div>
      <p className="text-sm font-medium text-success">Workflow complete</p>
      <p className="text-xs text-foreground/40 text-center max-w-xs">
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

      <div className="rounded-xl border border-foreground/10 bg-zinc-900/50 p-4">
        <PhaseView />
      </div>

      {/* Manual controls */}
      {phase !== 'complete' && (
        <div className="flex items-center gap-2 justify-end">
          {showForceAdvance && (
            <Button
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              onClick={forceAdvance}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium',
                'text-warning/70 hover:text-warning transition-colors',
                'border border-warning/20 rounded-lg hover:bg-warning/10',
              )}
            >
              <ChevronRight className="size-3" />
              Force advance
            </Button>
          )}
          {canAdvance &&
            phase !== 'awaiting_approval' &&
            phase !== 'verifying' && (
              <Button
                variant={ButtonVariant.UNSTYLED}
                withWrapper={false}
                onClick={() => advance('user')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-success border border-success/20 rounded-lg hover:bg-success/10 transition-colors"
              >
                <ChevronRight className="size-3" />
                Advance
              </Button>
            )}
        </div>
      )}

      <PhaseConversation />
      <PhaseTransitionLog />
    </div>
  );
}

export const AgentWorkflow = memo(AgentWorkflowInner);
