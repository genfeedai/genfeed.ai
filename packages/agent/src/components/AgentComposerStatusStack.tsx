import { AgentInputRequestOverlay } from '@genfeedai/agent/components/AgentInputRequestOverlay';
import type {
  AgentInputRequest,
  AgentProposedPlan,
  AgentWorkEvent,
} from '@genfeedai/agent/models/agent-chat.model';
import type { AgentSocketConnectionState } from '@genfeedai/agent/stores/agent-chat.store';
import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
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

// Every notice in this stack sits on the same opaque surface. Translucent
// tone fills (10% alpha) were unreadable over the conversation behind the
// composer, so tone now drives only the border and the icon — never the text
// contrast.
const STATUS_SURFACE_CLASS =
  'rounded-lg border bg-background-secondary px-3 py-2 shadow-sm';

// Transport errors arrive as "<action>: <status> - <server detail>". The
// server detail can be a raw ORM message, so it is split out and rendered as
// bounded secondary text instead of one unreadable run-on line.
function splitComposerError(error: string): {
  detail: string | null;
  summary: string;
} {
  const match = error.match(/^(.*?):\s*(\d{3})(?:\s*-\s*([\s\S]+))?$/);

  if (!match) {
    return { detail: null, summary: error };
  }

  const [, action, status, serverDetail] = match;
  const trimmedDetail = serverDetail?.trim();

  return {
    detail: trimmedDetail || null,
    summary: `${action} (${status})`,
  };
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
  const composerError = error ? splitComposerError(error) : null;
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

      {composerError ? (
        <div
          className={cn(
            STATUS_SURFACE_CLASS,
            'flex items-start gap-2 border-destructive/50',
          )}
          role="alert"
        >
          <HiOutlineExclamationTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-medium text-foreground text-sm leading-5">
              {composerError.summary}
            </p>
            {composerError.detail ? (
              <p className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words text-muted-foreground text-xs leading-5">
                {composerError.detail}
              </p>
            ) : null}
          </div>
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
          className={cn(
            STATUS_SURFACE_CLASS,
            'flex items-center gap-2 border-warning/50 text-foreground text-sm leading-5',
          )}
          role="status"
        >
          <HiOutlineSignalSlash className="size-4 shrink-0 text-warning" />
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
          className={cn(STATUS_SURFACE_CLASS, 'border-border')}
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
          className={cn(
            STATUS_SURFACE_CLASS,
            'border-border text-muted-foreground text-xs leading-5',
          )}
          role="status"
        >
          A plan is ready for explicit review in the conversation. This notice
          does not approve or execute it.
        </div>
      ) : null}
    </div>
  );
}
