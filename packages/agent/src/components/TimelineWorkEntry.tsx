import { getAgentToolLabel } from '@genfeedai/agent/components/agent-tool-call-display.helpers';
import { ToolCallDetailPanel } from '@genfeedai/agent/components/ToolCallDetailPanel';
import {
  AgentWorkEventStatus,
  AgentWorkEventType,
} from '@genfeedai/agent/models/agent-chat.model';
import type { EnrichedWorkEvent } from '@genfeedai/agent/utils/derive-timeline';
import { formatAgentErrorDetail } from '@genfeedai/agent/utils/format-agent-error.util';
import { formatDuration } from '@genfeedai/agent/utils/format-duration';
import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { memo, type ReactElement, useState } from 'react';

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
      <div className="size-3 shrink-0 rounded-full border-[1.5px] border-muted-foreground/40" />
    );
  }

  return (
    <div className="size-3 shrink-0 animate-spin rounded-full border-[1.5px] border-primary/60 border-t-transparent" />
  );
}

function getEventLabel(event: EnrichedWorkEvent): string {
  if (event.event === AgentWorkEventType.INPUT_REQUESTED)
    return 'Input Required';
  if (event.event === AgentWorkEventType.INPUT_SUBMITTED)
    return 'Input Submitted';
  if (event.toolName) return getAgentToolLabel(event.toolName);
  if (event.event === AgentWorkEventType.STARTED) return 'Run Started';
  if (event.event === AgentWorkEventType.COMPLETED) return 'Run Completed';
  if (event.event === AgentWorkEventType.FAILED) return 'Run Failed';
  if (event.event === AgentWorkEventType.CANCELLED) return 'Run Cancelled';
  return event.label;
}

function TimelineWorkEntryInner({
  event,
  stopActiveAnimation = false,
}: TimelineWorkEntryProps): ReactElement {
  const [isExpanded, setIsExpanded] = useState(false);
  const label = getEventLabel(event);
  const rawDetail =
    event.status === AgentWorkEventStatus.FAILED
      ? formatAgentErrorDetail(event.detail ?? event.resultSummary ?? null)
      : event.detail
        ? event.detail
        : (event.resultSummary ?? null);
  const detail = rawDetail
    ? rawDetail.length > 72
      ? `${rawDetail.slice(0, 69)}…`
      : rawDetail
    : null;
  const hasExpandableContent = Boolean(
    event.parameters || event.resultSummary || event.debug || event.detail,
  );

  const content = (
    <div className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs">
      <StatusIcon
        status={event.status}
        stopActiveAnimation={stopActiveAnimation}
      />
      <span className="font-medium text-foreground/85">{label}</span>
      {detail && (
        <>
          <span className="text-muted-foreground/35">—</span>
          <span className="truncate text-muted-foreground/65">{detail}</span>
        </>
      )}
      {event.durationMs != null && (
        <span className="ml-auto shrink-0 text-muted-foreground/45">
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
              ? (formatAgentErrorDetail(event.detail) ?? event.detail)
              : undefined)
          }
          parameters={event.parameters}
          resultSummary={event.resultSummary}
        />
      )}
    </div>
  );
}

// Work-event objects are stable across renders unless their content changes,
// so settled steps skip re-rendering while a sibling step is still live.
export const TimelineWorkEntry = memo(TimelineWorkEntryInner);
