import type {
  AgentChatMessage,
  AgentToolCall,
  AgentUiAction,
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

/**
 * Lifecycle bookends ("Agent started", "Run completed") are stream plumbing,
 * not user-facing steps. Shared by timeline collapse + composer status strip.
 */
export function isGenericRunLifecycleEvent(
  event: Pick<EnrichedWorkEvent, 'event' | 'label' | 'toolCallId' | 'toolName'>,
): boolean {
  if (event.toolName || event.toolCallId) {
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
    normalizedLabel === 'agent started' ||
    normalizedLabel === 'agent failed' ||
    normalizedLabel === 'agent completed' ||
    normalizedLabel === 'agent cancelled' ||
    normalizedLabel.startsWith('run ') ||
    normalizedLabel.startsWith('agent ') ||
    normalizedLabel.startsWith('turn ')
  );
}

/** True only for real in-flight work — not stuck lifecycle bookends. */
export function isActiveWorkEvent(
  event: Pick<
    EnrichedWorkEvent,
    'event' | 'label' | 'status' | 'toolCallId' | 'toolName'
  >,
): boolean {
  if (
    event.status !== AgentWorkEventStatus.RUNNING &&
    event.status !== AgentWorkEventStatus.PENDING
  ) {
    return false;
  }

  return !isGenericRunLifecycleEvent(event);
}

function normalizeWorkGroupEvents(
  group: EnrichedWorkEvent[],
): EnrichedWorkEvent[] {
  // Prefer real tool/input steps. Lifecycle-only groups keep a single
  // representative event so duration still derives, but UI hides the noise.
  const specific = group.filter((event) => !isGenericRunLifecycleEvent(event));
  if (specific.length > 0) {
    return specific;
  }

  return group;
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

  // Ignore stale "Agent started" / "Run started" still marked running after
  // the run finished — those kept groups "live" and showed Working forever.
  const hasActiveEvent = events.some((event) => isActiveWorkEvent(event));
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

  // Lifecycle bookends may linger as "running" after the run ends. Treat them
  // as settled when no real tool/input work is still active.
  const isSuccessfulCompletion = events.every((event) => {
    if (event.status === AgentWorkEventStatus.COMPLETED) {
      return true;
    }
    if (isGenericRunLifecycleEvent(event)) {
      return (
        event.status !== AgentWorkEventStatus.FAILED &&
        event.status !== AgentWorkEventStatus.CANCELLED
      );
    }
    return false;
  });
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

/**
 * Collapse key for snapshot cards.
 * Analytics cards collapse to ONE family so 7d + 30d become a single card
 * with period tabs (periodSnapshots) instead of stacked clones.
 */
export function getSnapshotCollapseKey(action: {
  id?: string;
  title?: string;
  type?: string;
}): string {
  if (action.type === 'analytics_snapshot_card') {
    return 'analytics_snapshot_card';
  }
  if (action.type === 'completion_summary_card') {
    return `completion_summary_card:${action.title ?? action.id ?? 'summary'}`;
  }
  return action.id || `${action.type ?? 'action'}:${action.title ?? ''}`;
}

function extractAnalyticsPeriod(action: AgentUiAction): string {
  const dataPeriod = action.data?.period;
  if (typeof dataPeriod === 'string' && dataPeriod.trim()) {
    return dataPeriod.trim();
  }
  const idMatch = action.id?.match(/analytics-snapshot:[^:]+:(.+)$/);
  if (idMatch?.[1]) {
    return idMatch[1];
  }
  const titleMatch = action.title?.match(/\(([^)]+)\)\s*$/);
  if (titleMatch?.[1]) {
    return titleMatch[1];
  }
  return 'summary';
}

/**
 * Collect every analytics snapshot in the thread and merge into one action
 * with periodSnapshots so the UI can toggle 7d / 30d without stacking cards.
 */
export function mergeAnalyticsSnapshotActions(
  snapshots: readonly AgentUiAction[],
): AgentUiAction | null {
  if (snapshots.length === 0) {
    return null;
  }

  const byPeriod = new Map<
    string,
    {
      period: string;
      metrics?: AgentUiAction['metrics'];
      title?: string;
      source: AgentUiAction;
    }
  >();

  for (const snapshot of snapshots) {
    const period = extractAnalyticsPeriod(snapshot);
    // Later snapshots for the same period win.
    byPeriod.set(period, {
      metrics: snapshot.metrics,
      period,
      source: snapshot,
      title: snapshot.title,
    });
  }

  const periodSnapshots = [...byPeriod.values()].map((entry) => ({
    metrics: entry.metrics,
    period: entry.period,
    title: entry.title,
  }));
  const latest = snapshots[snapshots.length - 1];
  if (!latest) {
    return null;
  }
  const preferred =
    byPeriod.get(extractAnalyticsPeriod(latest))?.source ?? latest;

  return {
    ...preferred,
    ctas: [
      {
        href: '/analytics/overview',
        label: 'Open analytics',
      },
    ],
    data: {
      ...(preferred.data ?? {}),
      period: extractAnalyticsPeriod(preferred),
      periodSnapshots,
    },
    id: preferred.id?.startsWith('analytics-snapshot:')
      ? preferred.id.replace(/:[^:]+$/, ':merged')
      : 'analytics-snapshot:merged',
    title: 'Analytics summary',
    type: 'analytics_snapshot_card',
  };
}

/**
 * Keep only the latest analytics family (merged periods) and completion
 * summary cards so re-runs do not stack clones in the transcript.
 */
export function collapseSupersededSnapshotCards(
  messages: readonly AgentChatMessage[],
): AgentChatMessage[] {
  const allAnalytics: AgentUiAction[] = [];
  let latestAnalyticsMessageId: string | null = null;
  const latestCompletionByKey = new Map<string, string>();

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (!message) {
      continue;
    }
    for (const action of message.metadata?.uiActions ?? []) {
      if (action.type === 'analytics_snapshot_card') {
        allAnalytics.push(action);
        latestAnalyticsMessageId = message.id;
        continue;
      }
      if (action.type === 'completion_summary_card') {
        const key = getSnapshotCollapseKey(action);
        latestCompletionByKey.set(key, message.id);
      }
    }
  }

  const mergedAnalytics = mergeAnalyticsSnapshotActions(allAnalytics);

  return messages.map((message) => {
    const actions = message.metadata?.uiActions;
    if (!actions?.length) {
      return message;
    }

    const kept: AgentUiAction[] = [];
    let insertedMergedAnalytics = false;

    for (const action of actions) {
      if (action.type === 'analytics_snapshot_card') {
        if (
          mergedAnalytics &&
          message.id === latestAnalyticsMessageId &&
          !insertedMergedAnalytics
        ) {
          kept.push(mergedAnalytics);
          insertedMergedAnalytics = true;
        }
        continue;
      }
      if (action.type === 'completion_summary_card') {
        const key = getSnapshotCollapseKey(action);
        if (latestCompletionByKey.get(key) === message.id) {
          kept.push(action);
        }
        continue;
      }
      kept.push(action);
    }

    const sameLength = kept.length === actions.length;
    const sameIds =
      sameLength &&
      kept.every((action, index) => action.id === actions[index]?.id);
    if (sameIds) {
      return message;
    }

    return {
      ...message,
      metadata: {
        ...message.metadata,
        uiActions: kept,
      },
    };
  });
}

export function deriveTimeline(
  messages: AgentChatMessage[],
  workEvents: AgentWorkEvent[],
  streamState: TimelineStreaming['streamState'],
  runDurationLabel: string | null,
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  const displayMessages = collapseSupersededSnapshotCards(messages);
  const assistantMessages = displayMessages.filter(
    (message) => message.role === 'assistant',
  );

  // 1. Create message entries
  for (const msg of displayMessages) {
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
      // Stream is idle — never keep tools "running" in history or the UI
      // shows "Working for 26m" after the turn already finished.
      historicalEvents.push(
        isActiveWorkEvent(event)
          ? {
              ...event,
              status: AgentWorkEventStatus.COMPLETED,
            }
          : { ...event },
      );
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

  // 6. Sort by createdAt. Chronological tool work lands before the answer so
  // live runs show tools first; step 7 flips settled work *after* the answer
  // so the "Worked for …" summary sits at the end of the turn (T3-style).
  entries.sort((a, b) => {
    const timeDiff = a.createdAt.localeCompare(b.createdAt);
    if (timeDiff !== 0) return timeDiff;

    const kindOrder = (kind: string) => {
      if (kind === 'user-message') return 0;
      if (kind === 'work-group') return 1;
      if (kind === 'assistant-message') return 2;
      return 3;
    };
    return kindOrder(a.kind) - kindOrder(b.kind);
  });

  // 7. Settled work summary after the answer for that turn
  const ordered = placeWorkGroupsAfterAnswers(entries);

  // 8. Append streaming entry if active (always last while live)
  if (
    isStreamActive ||
    streamState.activeToolCalls.length > 0 ||
    streamState.streamingContent ||
    streamState.streamingReasoning
  ) {
    ordered.push({
      createdAt: new Date().toISOString(),
      id: 'streaming-current',
      kind: 'streaming',
      runDurationLabel,
      streamState,
      workEvents: activeEvents,
    });
  }

  return ordered;
}

/**
 * When a run finished and the assistant reply exists, render the answer first
 * and the collapsible "Worked for …" / step log immediately after it.
 * Live work with no answer yet stays above (tools still in flight).
 */
export function placeWorkGroupsAfterAnswers(
  entries: TimelineEntry[],
): TimelineEntry[] {
  const result: TimelineEntry[] = [];
  let index = 0;

  while (index < entries.length) {
    const current = entries[index];
    if (current?.kind !== 'work-group') {
      result.push(current);
      index += 1;
      continue;
    }

    let end = index;
    while (end < entries.length && entries[end]?.kind === 'work-group') {
      end += 1;
    }

    const following = entries[end];
    if (following?.kind === 'assistant-message') {
      result.push(following);
      for (let workIndex = index; workIndex < end; workIndex += 1) {
        result.push(entries[workIndex]);
      }
      index = end + 1;
      continue;
    }

    for (let workIndex = index; workIndex < end; workIndex += 1) {
      result.push(entries[workIndex]);
    }
    index = end;
  }

  return result;
}
