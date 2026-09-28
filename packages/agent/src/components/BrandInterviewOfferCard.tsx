import { useAgentUiActionRequest } from '@genfeedai/agent/hooks/use-agent-ui-action-request';
import type {
  AgentUiAction,
  AgentUiActionHandler,
} from '@genfeedai/agent/models/agent-chat.model';
import { ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import { CircleCheck, Sparkles } from 'lucide-react';
import { type ReactElement, useCallback } from 'react';

interface BrandInterviewOfferCardProps {
  action: AgentUiAction;
  onUiAction?: AgentUiActionHandler;
}

export function BrandInterviewOfferCard({
  action,
  onUiAction,
}: BrandInterviewOfferCardProps): ReactElement {
  const request = useAgentUiActionRequest(onUiAction);

  const data = action.data ?? {};
  const completenessScore =
    typeof data.completenessScore === 'number' ? data.completenessScore : null;
  const currentQuestion =
    data.currentQuestion &&
    typeof data.currentQuestion === 'object' &&
    'questionText' in (data.currentQuestion as Record<string, unknown>)
      ? (data.currentQuestion as { questionText: string })
      : null;

  const startCta = action.ctas?.find((cta) => cta.action === 'start_interview');

  const phase = startCta?.action
    ? request.getPhase(startCta.action, startCta.payload)
    : 'idle';
  const isStarting = phase === 'running' || phase === 'awaiting';
  const isStarted = phase === 'completed';

  const handleStart = useCallback(async () => {
    if (!startCta?.action || !onUiAction || isStarting || isStarted) {
      return;
    }
    await request.submit(startCta.action, startCta.payload);
  }, [
    isStarted,
    isStarting,
    onUiAction,
    request,
    startCta?.action,
    startCta?.payload,
  ]);

  if (isStarted) {
    return (
      <div className="my-2 border border-success/20 bg-background p-4">
        <div className="flex items-center gap-2 text-success">
          <CircleCheck className="size-5" />
          <span className="text-sm font-medium">Interview started.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="my-2 border border-border bg-background p-4">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="size-5 text-amber-500" />
        <h3 className="text-sm font-semibold text-foreground">
          {action.title || 'Brand Context Interview'}
        </h3>
      </div>

      {action.description ? (
        <p className="mb-3 text-xs text-muted-foreground">
          {action.description}
        </p>
      ) : null}

      {completenessScore !== null ? (
        <div className="mb-3 border border-border bg-card/40 p-3">
          <p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
            Current completeness
          </p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {completenessScore}%
          </p>
        </div>
      ) : null}

      {currentQuestion ? (
        <div className="mb-3 border border-border bg-card/40 p-3">
          <p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
            First question
          </p>
          <p className="mt-1 text-sm text-foreground">
            {currentQuestion.questionText}
          </p>
        </div>
      ) : null}

      {startCta?.action ? (
        <Button
          variant={ButtonVariant.DEFAULT}
          isDisabled={isStarting}
          isLoading={isStarting}
          onClick={() => {
            void handleStart();
          }}
          icon={<Sparkles className="size-4" />}
          className="mt-4 w-full justify-center"
        >
          {isStarting ? 'Starting...' : (startCta.label ?? 'Start interview')}
        </Button>
      ) : null}
    </div>
  );
}
