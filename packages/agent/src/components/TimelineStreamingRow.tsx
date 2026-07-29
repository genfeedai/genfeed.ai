import { AnimatedStatusText } from '@genfeedai/agent/components/AnimatedStatusText';
import { TOOL_LABELS } from '@genfeedai/agent/components/agent-tool-call-display.helpers';
import { TimelineWorkEntry } from '@genfeedai/agent/components/TimelineWorkEntry';
import { useAnimatedText } from '@genfeedai/agent/hooks/use-animated-text';
import {
  AgentWorkEventStatus,
  AgentWorkEventType,
} from '@genfeedai/agent/models/agent-chat.model';
import type { TimelineStreaming } from '@genfeedai/agent/utils/derive-timeline';
import { summarizeStreamingProgress } from '@genfeedai/agent/utils/summarize-streaming-progress';
import { type ReactElement, useMemo } from 'react';
import { HiClock, HiSparkles } from 'react-icons/hi2';

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
    label: TOOL_LABELS[tc.name] ?? tc.name,
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

  return (
    <div className="mb-2 flex justify-start motion-reduce:animate-none animate-in fade-in slide-in-from-bottom-1 duration-200 ease-out">
      <div className="w-full max-w-none space-y-2 border-0 bg-transparent px-0.5 py-1">
        {!hasContent ? (
          <div className="flex items-center gap-1.5 text-[11px] text-foreground/50">
            <HiSparkles className="size-3.5 text-primary/70" />
            <AnimatedStatusText
              text={progressSummary.label}
              className="font-medium tracking-[0.01em]"
            />
          </div>
        ) : null}

        {progressSummary.detail && !hasContent ? (
          <p className="text-[12px] leading-relaxed text-foreground/55">
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
          <div className="px-0 py-0.5">
            <p className="whitespace-pre-wrap break-words text-[15px] leading-7 text-foreground">
              {displayedText}
              {(streamState.isStreaming || isAnimating) && (
                <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-foreground align-middle" />
              )}
            </p>
          </div>
        ) : null}

        {durationFooter ? (
          <div className="flex items-center gap-1.5 pt-1 text-xs text-foreground/50">
            <HiClock className="size-3.5 shrink-0 text-foreground/40" />
            <span className="font-medium text-foreground/65">
              {durationFooter}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
