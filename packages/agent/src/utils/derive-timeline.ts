import type {
  AgentChatMessage,
  AgentToolCall,
  AgentWorkEvent,
} from '@genfeedai/agent/models/agent-chat.model';
import {
  AgentWorkEventStatus,
  AgentWorkEventType,
} from '@genfeedai/agent/models/agent-chat.model';

export interface EnrichedWorkEvent extends AgentWorkEvent {
  durationMs?: number;
  creditsUsed?: number;
  parameters?: Record<string, unknown>;
  resultSummary?: string;
}

export interface TimelineUserMessage {
  kind: 'user-message';
  id: string;
  message: AgentChatMessage;
  createdAt: string;
}

export interface TimelineAssistantMessage {
  kind: 'assistant-message';
  id: string;
  message: AgentChatMessage;
  createdAt: string;
}

export interface TimelineWorkGroup {
  kind: 'work-group';
  id: string;
  events: EnrichedWorkEvent[];
  createdAt: string;
  presentation: 'live' | 'archived';
  totalDurationMs: number | null;
}

export interface TimelineStreaming {
  kind: 'streaming';
  id: string;
  streamState: {
    isStreaming: boolean;
    streamingContent: string;
    streamingReasoning: string;
    activeToolCalls: AgentToolCall[];
  };
  workEvents: AgentWorkEvent[];
  runDurationLabel: string | null;
  createdAt: string;
}

export type TimelineEntry =
  | TimelineUserMessage
  | TimelineAssistantMessage
  | TimelineWorkGroup
  | TimelineStreaming;

const ADJACENCY_THRESHOLD_MS = 2000;

function isGenericRunLifecycleEvent(event: EnrichedWorkEvent): boolean {
  if (event.toolName) {
    return false;
  }

  const normalizedLabel = event.label.trim().toLowerCase();

  if (
    event.event !== AgentWorkEventType.STARTED &&
    event.event !== AgentWorkEventType.COMPLETED &&
    event.event !== AgentWorkEventType.FAILED &&
    event.event !== AgentWorkEventType.CANCELLED
  ) {
    return false;
  }

  return (
    normalizedLabel === 'turn started' ||
    normalizedLabel === 'run started' ||
    normalizedLabel === 'run completed' ||
    normalizedLabel === 'run failed' ||
    normalizedLabel === 'run cancelled' ||
    normalizedLabel.startsWith('run ')
  );
}

function normalizeWorkGroupEvents(
  group: EnrichedWorkEvent[],
): EnrichedWorkEvent[] {
  const hasSpecificEvents = group.some(
    (event) => !isGenericRunLifecycleEvent(event),
  );

  if (!hasSpecificEvents) {
    return group;
  }

  const filtered = group.filter((event) => !isGenericRunLifecycleEvent(event));
  return filtered.length > 0 ? filtered : group;
}

function buildVisualStepKey(event: EnrichedWorkEvent): string | null {
  if (event.inputRequestId) {
    return `input:${event.inputRequestId}`;
  }

  if (event.toolCallId) {
    return `tool:${event.toolCallId}`;
  }

  if (event.toolName) {
    return `tool-name:${event.runId ?? 'standalone'}:${event.toolName}`;
  }

  if (isGenericRunLifecycleEvent(event)) {
    return `run:${event.runId ?? 'standalone'}:${event.event}`;
  }

  return null;
}

function mergeVisualStepEvents(
  existing: EnrichedWorkEvent,
  incoming: EnrichedWorkEvent,
): EnrichedWorkEvent {
  return {
    ...existing,
    createdAt: existing.createdAt,
    creditsUsed: incoming.creditsUsed ?? existing.creditsUsed,
    debug: incoming.debug ?? existing.debug,
    detail: incoming.detail ?? existing.detail,
    durationMs: incoming.durationMs ?? existing.durationMs,
    estimatedDurationMs:
      incoming.estimatedDurationMs ?? existing.estimatedDurationMs,
    event: incoming.event,
    id: existing.id,
    inputRequestId: existing.inputRequestId ?? incoming.inputRequestId,
    label: incoming.label || existing.label,
    parameters: incoming.parameters ?? existing.parameters,
    phase: incoming.phase ?? existing.phase,
    progress: incoming.progress ?? existing.progress,
    remainingDurationMs:
      incoming.remainingDurationMs ?? existing.remainingDurationMs,
    resultSummary: incoming.resultSummary ?? existing.resultSummary,
    runId: existing.runId ?? incoming.runId,
    startedAt: existing.startedAt ?? incoming.startedAt,
    status: incoming.status,
    threadId: existing.threadId,
    toolCallId: existing.toolCallId ?? incoming.toolCallId,
    toolName: incoming.toolName ?? existing.toolName,
  };
}

function collapseWorkGroupEvents(
  group: EnrichedWorkEvent[],
): EnrichedWorkEvent[] {
  const collapsedEvents: EnrichedWorkEvent[] = [];
  const indexByKey = new Map<string, number>();

  for (const event of group) {
    const key = buildVisualStepKey(event);

    if (!key) {
      collapsedEvents.push(event);
      continue;
    }

    const existingIndex = indexByKey.get(key);
    if (existingIndex == null) {
      indexByKey.set(key, collapsedEvents.length);
      collapsedEvents.push(event);
      continue;
    }

    collapsedEvents[existingIndex] = mergeVisualStepEvents(
      collapsedEvents[existingIndex],
      event,
    );
  }

  return collapsedEvents;
}

function groupWorkEventsByRun(
  events: EnrichedWorkEvent[],
): EnrichedWorkEvent[][] {
  if (events.length === 0) return [];

  const groups: EnrichedWorkEvent[][] = [];
  let currentGroup: EnrichedWorkEvent[] = [events[0]];
  let currentRunId = events[0].runId;

  for (let i = 1; i < events.length; i++) {
    const event = events[i];

    if (event.runId && currentRunId && event.runId === currentRunId) {
      currentGroup.push(event);
      continue;
    }

    if (event.runId && event.runId !== currentRunId) {
      groups.push(currentGroup);
      currentGroup = [event];
      currentRunId = event.runId;
      continue;
    }

    // No runId — group by time adjacency
    const prevTime = new Date(
      currentGroup[currentGroup.length - 1].createdAt,
    ).getTime();
    const eventTime = new Date(event.createdAt).getTime();

    if (
      Math.abs(eventTime - prevTime) <= ADJACENCY_THRESHOLD_MS &&
      !currentRunId
    ) {
      currentGroup.push(event);
    } else {
      groups.push(currentGroup);
      currentGroup = [event];
      currentRunId = event.runId;
    }
  }

  groups.push(currentGroup);
  return groups;
}

function parseEventTime(value?: string): number | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function getGroupDurationMs(events: EnrichedWorkEvent[]): number | null {
  let earliestMs: number | null = null;
  let latestMs: number | null = null;
  let maxExplicitDurationMs: number | null = null;

  for (const event of events) {
    const startMs =
      parseEventTime(event.startedAt) ?? parseEventTime(event.createdAt);
    const endMs =
      parseEventTime(event.createdAt) ?? parseEventTime(event.startedAt);

    if (startMs != null) {
      earliestMs = earliestMs == null ? startMs : Math.min(earliestMs, startMs);
    }

    if (endMs != null) {
      latestMs = latestMs == null ? endMs : Math.max(latestMs, endMs);
    }

    if (event.durationMs != null) {
      maxExplicitDurationMs =
        maxExplicitDurationMs == null
          ? event.durationMs
          : Math.max(maxExplicitDurationMs, event.durationMs);
    }
  }

  if (earliestMs != null && latestMs != null && latestMs > earliestMs) {
    return latestMs - earliestMs;
  }

  return maxExplicitDurationMs;
}

function shouldArchiveWorkGroup(
  events: EnrichedWorkEvent[],
  assistantMessages: AgentChatMessage[],
): boolean {
  if (events.length === 0) {
    return false;
  }

  const hasActiveEvent = events.some((event) =>
    [AgentWorkEventStatus.RUNNING, AgentWorkEventStatus.PENDING].includes(
      event.status,
    ),
  );
  if (hasActiveEvent) {
    return false;
  }

  const hasFailureOrCancellation = events.some((event) =>
    [AgentWorkEventStatus.FAILED, AgentWorkEventStatus.CANCELLED].includes(
      event.status,
    ),
  );
  if (hasFailureOrCancellation) {
    return false;
  }

  const isSuccessfulCompletion = events.every(
    (event) => event.status === AgentWorkEventStatus.COMPLETED,
  );
  if (!isSuccessfulCompletion) {
    return false;
  }

  const latestEventCreatedAt = events.reduce(
    (latest, event) => (event.createdAt > latest ? event.createdAt : latest),
    events[0].createdAt,
  );

  return assistantMessages.some(
    (message) => message.createdAt >= latestEventCreatedAt,
  );
}

function enrichWorkEvents(
  events: EnrichedWorkEvent[],
  messages: AgentChatMessage[],
): void {
  // For each work group, find the assistant message that follows it by timestamp
  // and match toolCalls by toolName (positional matching for duplicates)
  const sortedMessages = [...messages]
    .filter((m) => m.role === 'assistant' && m.metadata?.toolCalls?.length)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  if (sortedMessages.length === 0) return;

  // Build a map: for each assistant message, track used tool call indices
  const usedIndices = new Map<string, Set<number>>();

  for (const event of events) {
    if (!event.toolName) continue;

    // Find the first assistant message at or after this event's timestamp
    const assistantMsg = sortedMessages.find(
      (m) => m.createdAt >= event.createdAt,
    );
    if (!assistantMsg?.metadata?.toolCalls) continue;

    const msgId = assistantMsg.id;
    if (!usedIndices.has(msgId)) {
      usedIndices.set(msgId, new Set());
    }
    const used = usedIndices.get(msgId)!;

    const toolCalls = assistantMsg.metadata.toolCalls;
    const matchIndex = toolCalls.findIndex(
      (tc, idx) => tc.name === event.toolName && !used.has(idx),
    );

    if (matchIndex >= 0) {
      used.add(matchIndex);
      const tc = toolCalls[matchIndex];
      event.durationMs = (
        tc as AgentToolCall & { durationMs?: number }
      ).durationMs;
      event.creditsUsed = (
        tc as AgentToolCall & { creditsUsed?: number }
      ).creditsUsed;
      event.parameters =
        tc.parameters ??
        (Object.keys(tc.arguments).length > 0 ? tc.arguments : undefined);
      event.resultSummary = tc.resultSummary;
    }
  }
}

export function deriveTimeline(
  messages: AgentChatMessage[],
  workEvents: AgentWorkEvent[],
  streamState: TimelineStreaming['streamState'],
  runDurationLabel: string | null,
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  const assistantMessages = messages.filter(
    (message) => message.role === 'assistant',
  );

  // 1. Create message entries
  for (const msg of messages) {
    if (msg.role === 'user') {
      entries.push({
        createdAt: msg.createdAt,
        id: `msg-${msg.id}`,
        kind: 'user-message',
        message: msg,
      });
    } else if (msg.role === 'assistant') {
      entries.push({
        createdAt: msg.createdAt,
        id: `msg-${msg.id}`,
        kind: 'assistant-message',
        message: msg,
      });
    }
  }

  // 2. Separate historical vs active work events
  const activeStatuses = new Set([
    AgentWorkEventStatus.RUNNING,
    AgentWorkEventStatus.PENDING,
  ]);
  const isStreamActive = streamState.isStreaming;

  const historicalEvents: EnrichedWorkEvent[] = [];
  const activeEvents: AgentWorkEvent[] = [];

  for (const event of workEvents) {
    if (isStreamActive && activeStatuses.has(event.status)) {
      activeEvents.push(event);
    } else {
      historicalEvents.push({ ...event });
    }
  }

  // 3. Sort historical events by createdAt
  historicalEvents.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  // 4. Enrich historical events from metadata.toolCalls
  enrichWorkEvents(historicalEvents, messages);

  // 5. Group historical events by runId or adjacency
  const groups = groupWorkEventsByRun(historicalEvents);

  for (const group of groups) {
    const normalizedGroup = normalizeWorkGroupEvents(
      collapseWorkGroupEvents(group),
    );
    entries.push({
      createdAt: normalizedGroup[0].createdAt,
      events: normalizedGroup,
      id: `work-${normalizedGroup[0].id}`,
      kind: 'work-group',
      presentation: shouldArchiveWorkGroup(normalizedGroup, assistantMessages)
        ? 'archived'
        : 'live',
      totalDurationMs: getGroupDurationMs(normalizedGroup),
    });
  }

  // 6. Sort all entries by createdAt, with tie-break: work-group before assistant-message
  entries.sort((a, b) => {
    const timeDiff = a.createdAt.localeCompare(b.createdAt);
    if (timeDiff !== 0) return timeDiff;

    // Tie-break: work-group sorts before assistant-message
    const kindOrder = (kind: string) => {
      if (kind === 'user-message') return 0;
      if (kind === 'work-group') return 1;
      if (kind === 'assistant-message') return 2;
      return 3;
    };
    return kindOrder(a.kind) - kindOrder(b.kind);
  });

  // 7. Append streaming entry if active
  if (
    isStreamActive ||
    streamState.activeToolCalls.length > 0 ||
    streamState.streamingContent ||
    streamState.streamingReasoning
  ) {
    entries.push({
      createdAt: new Date().toISOString(),
      id: 'streaming-current',
      kind: 'streaming',
      runDurationLabel,
      streamState,
      workEvents: activeEvents,
    });
  }

  return entries;
}
