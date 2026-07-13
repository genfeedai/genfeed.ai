import { AgentInputRequestOverlay } from '@genfeedai/agent/components/AgentInputRequestOverlay';
import type {
  AgentInputRequest,
  AgentProposedPlan,
  AgentWorkEvent,
} from '@genfeedai/agent/models/agent-chat.model';
import type { AgentSocketConnectionState } from '@genfeedai/agent/stores/agent-chat.store';
import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { Progress } from '@ui/primitives/progress';
import type { ReactElement } from 'react';
import {
  HiOutlineExclamationTriangle,
  HiOutlineSignalSlash,
  HiXMark,
} from 'react-icons/hi2';

interface AgentComposerStatusStackProps {
  activeWorkEvent: AgentWorkEvent | null;
  error: string | null;
  isSubmittingInputRequest: boolean;
  latestProposedPlan: AgentProposedPlan | null;
  onClearError: () => void;
  onSubmitInputRequest: (answer: string) => void | Promise<void>;
  pendingInputRequest: AgentInputRequest | null;
  socketConnectionState: AgentSocketConnectionState;
}

function getDeterminateProgress(event: AgentWorkEvent): number | null {
  if (
    typeof event.progress !== 'number' ||
    !Number.isFinite(event.progress) ||
    event.progress < 0 ||
    event.progress > 100
  ) {
    return null;
  }

  return event.progress;
}

export function AgentComposerStatusStack({
  activeWorkEvent,
  error,
  isSubmittingInputRequest,
  latestProposedPlan,
  onClearError,
  onSubmitInputRequest,
  pendingInputRequest,
  socketConnectionState,
}: AgentComposerStatusStackProps): ReactElement | null {
  const determinateProgress = activeWorkEvent
    ? getDeterminateProgress(activeWorkEvent)
    : null;
  const hasConnectionWarning = socketConnectionState !== 'connected';
  const hasPlanReview = latestProposedPlan?.status === 'awaiting_approval';

  if (
    !activeWorkEvent &&
    !error &&
    !hasConnectionWarning &&
    !hasPlanReview &&
    !pendingInputRequest
  ) {
    return null;
  }

  return (
    <div
      aria-label="Conversation status and pending input"
      className="max-h-[60dvh] space-y-2 overflow-y-auto pb-2"
      role="region"
    >
      {pendingInputRequest ? (
        <AgentInputRequestOverlay
          key={pendingInputRequest.inputRequestId}
          isSubmitting={isSubmittingInputRequest}
          onSubmit={onSubmitInputRequest}
          request={pendingInputRequest}
          variant="composer"
        />
      ) : null}

      {error ? (
        <div
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          role="alert"
        >
          <HiOutlineExclamationTriangle className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0 flex-1 leading-5">{error}</span>
          <Button
            ariaLabel="Dismiss composer error"
            className="size-7 shrink-0"
            icon={<HiXMark className="size-4" />}
            onClick={onClearError}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          />
        </div>
      ) : null}

      {hasConnectionWarning ? (
        <div
          aria-live="polite"
          className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning"
          role="status"
        >
          <HiOutlineSignalSlash className="size-4 shrink-0" />
          {socketConnectionState === 'offline'
            ? 'Offline. Your draft is safe; sending is paused.'
            : socketConnectionState === 'connecting'
              ? 'Connecting. Your draft is safe; sending starts when connected.'
              : 'Reconnecting. Your draft is safe; sending resumes when connected.'}
        </div>
      ) : null}

      {activeWorkEvent ? (
        <div
          aria-live="polite"
          className="rounded-lg border border-border bg-background-secondary/92 px-3 py-2"
          role="status"
        >
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="truncate font-medium text-foreground/82">
              {activeWorkEvent.label}
            </span>
            {determinateProgress !== null ? (
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {Math.round(determinateProgress)}%
              </span>
            ) : (
              <span className="shrink-0 text-muted-foreground">Active</span>
            )}
          </div>
          {activeWorkEvent.detail ? (
            <p className="mt-1 truncate text-[11px] text-muted-foreground">
              {activeWorkEvent.detail}
            </p>
          ) : null}
          {determinateProgress !== null ? (
            <Progress
              aria-label={`${activeWorkEvent.label} progress`}
              aria-valuetext={`${Math.round(determinateProgress)} percent`}
              className="mt-2 h-1"
              value={determinateProgress}
            />
          ) : null}
        </div>
      ) : null}

      {hasPlanReview ? (
        <div
          className="rounded-lg border border-border bg-background-secondary/92 px-3 py-2 text-xs leading-5 text-foreground/72"
          role="status"
        >
          A plan is ready for explicit review in the conversation. This notice
          does not approve or execute it.
        </div>
      ) : null}
    </div>
  );
}
