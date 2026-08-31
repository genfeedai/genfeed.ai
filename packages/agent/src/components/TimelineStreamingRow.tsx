import { AnimatedStatusText } from '@genfeedai/agent/components/AnimatedStatusText';
import { getAgentToolLabel } from '@genfeedai/agent/components/agent-tool-call-display.helpers';
import { TimelineWorkEntry } from '@genfeedai/agent/components/TimelineWorkEntry';
import { useAnimatedText } from '@genfeedai/agent/hooks/use-animated-text';
import {
  AgentWorkEventStatus,
  AgentWorkEventType,
} from '@genfeedai/agent/models/agent-chat.model';
import type { TimelineStreaming } from '@genfeedai/agent/utils/derive-timeline';
import { summarizeStreamingProgress } from '@genfeedai/agent/utils/summarize-streaming-progress';
import { Clock, Sparkles } from 'lucide-react';
import { type ReactElement, useMemo } from 'react';

interface TimelineStreamingRowProps {
  entry: TimelineStreaming;
}

/**
 * Live stream card. T3 places "Working for …" at the end of the turn; we
 * mirror that — status + tools + text first, duration always last.
 */
export function TimelineStreamingRow({
  entry,
}: TimelineStreamingRowProps): ReactElement | null {
  const { streamState, workEvents, runDurationLabel } = entry;
  const progressSummary = useMemo(
    () => summarizeStreamingProgress(streamState, workEvents),
    [streamState, workEvents],
  );
  const { displayedText, isAnimating } = useAnimatedText(
    streamState.streamingContent,
    {
      animate: Boolean(streamState.streamingContent),
      charsPerTick: 1,
      intervalMs: 10,
    },
  );

  const hasContent = Boolean(streamState.streamingContent);
  const hasReasoning = Boolean(streamState.streamingReasoning);
  const hasToolCalls = streamState.activeToolCalls.length > 0;
  const hasWorkEvents = workEvents.length > 0;
  const hasAnything =
    streamState.isStreaming ||
    hasContent ||
    hasReasoning ||
    hasToolCalls ||
    hasWorkEvents;

  if (!hasAnything) {
    return null;
  }

  const toolCallEvents = streamState.activeToolCalls.map((tc) => ({
    createdAt: new Date().toISOString(),
    debug: tc.debug,
    detail: tc.detail,
    estimatedDurationMs: tc.estimatedDurationMs,
    event:
      tc.status === 'completed'
        ? AgentWorkEventType.TOOL_COMPLETED
        : AgentWorkEventType.TOOL_STARTED,
    id: tc.id,
    label: getAgentToolLabel(tc.name),
    parameters: tc.parameters ?? tc.arguments,
    phase: tc.phase,
    progress: tc.progress,
    remainingDurationMs: tc.remainingDurationMs,
    resultSummary: tc.resultSummary,
    startedAt: tc.startedAt,
    status:
      tc.status === 'failed'
        ? AgentWorkEventStatus.FAILED
        : tc.status === 'completed'
          ? AgentWorkEventStatus.COMPLETED
          : AgentWorkEventStatus.RUNNING,
    threadId: '',
    toolCallId: tc.id,
    toolName: tc.name,
  }));
  const nonToolWorkEvents = workEvents.filter((event) => !event.toolCallId);

  const durationFooter =
    runDurationLabel != null && runDurationLabel.length > 0
      ? streamState.isStreaming
        ? `Working for ${runDurationLabel}`
        : `Worked for ${runDurationLabel}`
      : streamState.isStreaming
        ? 'Working…'
        : null;

  const meaningfulNonToolEvents = nonToolWorkEvents.filter(
    (event) => event.toolName || event.toolCallId || event.detail,
  );

  // When tools or text already paint the turn, drop the pure "Thinking/Working"
  // header row — composer status stack mirrors busy state (T3 density).
  const showStatusHeader =
    !hasContent &&
    toolCallEvents.length === 0 &&
    meaningfulNonToolEvents.length === 0;

  return (
    <div className="mb-2 flex min-w-0 w-full justify-start motion-reduce:animate-none animate-in fade-in slide-in-from-bottom-1 duration-200 ease-out">
      <div className="w-full min-w-0 max-w-full space-y-1.5 border-0 bg-transparent px-0.5 py-1">
        {showStatusHeader ? (
          <div className="flex min-w-0 items-center gap-1.5 text-2xs text-gray-900">
            <Sparkles className="size-3.5 shrink-0 text-primary/70" />
            <AnimatedStatusText
              text={progressSummary.label}
              className="min-w-0 font-medium tracking-[0.01em]"
            />
          </div>
        ) : null}

        {progressSummary.detail && showStatusHeader ? (
          <p className="min-w-0 break-words text-xs leading-relaxed text-gray-900">
            {progressSummary.detail}
          </p>
        ) : null}

        {toolCallEvents.map((event) => (
          <TimelineWorkEntry key={event.id} event={event} />
        ))}

        {meaningfulNonToolEvents.map((event) => (
          <TimelineWorkEntry key={event.id} event={event} />
        ))}

        {hasContent ? (
          <div className="min-w-0 px-0 py-0.5">
            <p className="min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-md leading-7 text-foreground">
              {displayedText}
              {(streamState.isStreaming || isAnimating) && (
                <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-foreground align-middle" />
              )}
            </p>
          </div>
        ) : null}

        {durationFooter ? (
          <div className="flex min-w-0 items-center gap-1.5 pt-1 text-xs text-gray-900">
            <Clock className="size-3.5 shrink-0 text-gray-800" />
            <span className="min-w-0 font-medium text-gray-900">
              {durationFooter}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
