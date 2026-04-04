import { TOOL_LABELS } from '@cloud/agent/components/AgentToolCallDisplay';
import { ToolCallDetailPanel } from '@cloud/agent/components/ToolCallDetailPanel';
import {
  AgentWorkEventStatus,
  AgentWorkEventType,
} from '@cloud/agent/models/agent-chat.model';
import type { EnrichedWorkEvent } from '@cloud/agent/utils/derive-timeline';
import { formatDuration } from '@cloud/agent/utils/format-duration';
import { ButtonVariant } from '@genfeedai/enums';
import Button from '@ui/buttons/base/Button';
import { type ReactElement, useState } from 'react';

interface TimelineWorkEntryProps {
  event: EnrichedWorkEvent;
  stopActiveAnimation?: boolean;
}

function StatusIcon({
  status,
  stopActiveAnimation = false,
}: {
  status: AgentWorkEventStatus;
  stopActiveAnimation?: boolean;
}): ReactElement {
  if (status === AgentWorkEventStatus.COMPLETED) {
    return (
      <svg
        aria-hidden="true"
        focusable="false"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        className="shrink-0 text-green-500"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  }

  if (status === AgentWorkEventStatus.FAILED) {
    return (
      <svg
        aria-hidden="true"
        focusable="false"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        className="shrink-0 text-destructive"
      >
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    );
  }

  if (status === AgentWorkEventStatus.CANCELLED || stopActiveAnimation) {
    return (
      <div className="h-3 w-3 shrink-0 rounded-full border-[1.5px] border-muted-foreground/40" />
    );
  }

  return (
    <div className="h-3 w-3 shrink-0 animate-spin rounded-full border-[1.5px] border-primary/60 border-t-transparent" />
  );
}

function getEventLabel(event: EnrichedWorkEvent): string {
  if (event.event === AgentWorkEventType.INPUT_REQUESTED)
    return 'Input Required';
  if (event.event === AgentWorkEventType.INPUT_SUBMITTED)
    return 'Input Submitted';
  if (event.toolName) return TOOL_LABELS[event.toolName] ?? event.toolName;
  if (event.event === AgentWorkEventType.STARTED) return 'Run Started';
  if (event.event === AgentWorkEventType.COMPLETED) return 'Run Completed';
  if (event.event === AgentWorkEventType.FAILED) return 'Run Failed';
  if (event.event === AgentWorkEventType.CANCELLED) return 'Run Cancelled';
  return event.label;
}

export function TimelineWorkEntry({
  event,
  stopActiveAnimation = false,
}: TimelineWorkEntryProps): ReactElement {
  const [isExpanded, setIsExpanded] = useState(false);
  const label = getEventLabel(event);
  const detail = event.detail
    ? event.detail.length > 60
      ? `${event.detail.slice(0, 57)}...`
      : event.detail
    : event.resultSummary
      ? event.resultSummary.length > 60
        ? `${event.resultSummary.slice(0, 57)}...`
        : event.resultSummary
      : null;
  const hasExpandableContent = Boolean(
    event.parameters || event.resultSummary || event.debug,
  );

  const content = (
    <div className="flex items-center gap-1.5 py-1 px-1 text-xs">
      <StatusIcon
        status={event.status}
        stopActiveAnimation={stopActiveAnimation}
      />
      <span className="font-medium text-foreground/80">{label}</span>
      {detail && (
        <>
          <span className="text-muted-foreground/40">&mdash;</span>
          <span className="truncate text-muted-foreground/60">{detail}</span>
        </>
      )}
      {event.durationMs != null && (
        <span className="ml-auto shrink-0 text-muted-foreground/50">
          {formatDuration(event.durationMs)}
        </span>
      )}
    </div>
  );

  if (!hasExpandableContent) {
    return <div>{content}</div>;
  }

  return (
    <div>
      <Button
        variant={ButtonVariant.UNSTYLED}
        withWrapper={false}
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full text-left"
      >
        {content}
      </Button>
      {isExpanded && (
        <ToolCallDetailPanel
          debug={event.debug}
          error={
            event.debug?.error ??
            (event.status === AgentWorkEventStatus.FAILED
              ? event.detail
              : undefined)
          }
          parameters={event.parameters}
          resultSummary={event.resultSummary}
        />
      )}
    </div>
  );
}
