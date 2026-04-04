import { TOOL_LABELS } from '@cloud/agent/components/AgentToolCallDisplay';
import { AnimatedStatusText } from '@cloud/agent/components/AnimatedStatusText';
import { TimelineWorkEntry } from '@cloud/agent/components/TimelineWorkEntry';
import { useAnimatedText } from '@cloud/agent/hooks/use-animated-text';
import {
  AgentWorkEventStatus,
  AgentWorkEventType,
} from '@cloud/agent/models/agent-chat.model';
import type { TimelineStreaming } from '@cloud/agent/utils/derive-timeline';
import { summarizeStreamingProgress } from '@cloud/agent/utils/summarize-streaming-progress';
import { type ReactElement, useMemo } from 'react';
import { HiClock, HiSparkles } from 'react-icons/hi2';

interface TimelineStreamingRowProps {
  entry: TimelineStreaming;
}

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
  const statusLabel =
    progressSummary.label === 'Thinking' && runDurationLabel
      ? `Thinking for ${runDurationLabel}`
      : progressSummary.label;

  if (!hasAnything) {
    return null;
  }

  // Convert active tool calls to enriched work events for TimelineWorkEntry
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

  return (
    <div className="mb-3 flex justify-start motion-reduce:animate-none animate-in fade-in slide-in-from-bottom-1 duration-200 ease-out">
      <div className="w-full max-w-none space-y-1 border-l border-white/[0.08] pl-4 md:pl-5">
        <div className="px-0 py-1">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <HiSparkles className="h-3.5 w-3.5 text-primary/70" />
            <AnimatedStatusText
              text={statusLabel}
              className="font-medium tracking-[0.01em]"
            />
            {progressSummary.label !== 'Thinking' && runDurationLabel ? (
              <>
                <span aria-hidden="true" className="text-muted-foreground/60">
                  •
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                  <HiClock className="h-3 w-3" />
                  <span>{runDurationLabel}</span>
                </span>
              </>
            ) : null}
          </div>
          {progressSummary.detail && !hasContent ? (
            <p className="mt-1.5 border-l-2 border-primary/25 pl-2.5 text-[11px] leading-relaxed text-muted-foreground">
              {progressSummary.detail}
            </p>
          ) : null}
        </div>

        {/* Active tool calls as compact rows */}
        {toolCallEvents.map((event) => (
          <TimelineWorkEntry key={event.id} event={event} />
        ))}

        {/* Completed work events from the active run */}
        {nonToolWorkEvents.map((event) => (
          <TimelineWorkEntry key={event.id} event={event} />
        ))}

        {/* Streaming content */}
        {hasContent && (
          <div className="px-0 py-1">
            <p className="whitespace-pre-wrap break-words text-sm leading-7 text-foreground">
              {displayedText}
              {(streamState.isStreaming || isAnimating) && (
                <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-foreground align-middle" />
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
