import type {
  AgentInputRequest,
  AgentThread,
  AgentThreadSnapshot,
} from '@genfeedai/agent/models/agent-chat.model';
import {
  AgentWorkEventStatus,
  AgentWorkEventType,
} from '@genfeedai/agent/models/agent-chat.model';

export function mapSnapshotRunStatus(
  status?: string | null,
): 'idle' | 'running' | 'cancelling' | 'completed' | 'failed' | 'cancelled' {
  switch (status) {
    case 'queued':
    case 'running':
    case 'waiting_input':
      return 'running';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'idle';
  }
}

function readPayloadString(
  entry: AgentThreadSnapshot['timeline'][number],
  key: string,
): string | undefined {
  const value = entry.payload?.[key];
  return typeof value === 'string' ? value : undefined;
}

function mapTimelineEventType(
  entry: AgentThreadSnapshot['timeline'][number],
): AgentWorkEventType | null {
  const payloadEvent = readPayloadString(entry, 'event');
  const sourceEventType = readPayloadString(entry, 'sourceEventType');

  switch (payloadEvent) {
    case AgentWorkEventType.STARTED:
      return AgentWorkEventType.STARTED;
    case AgentWorkEventType.TOOL_STARTED:
      return AgentWorkEventType.TOOL_STARTED;
    case AgentWorkEventType.TOOL_COMPLETED:
      return AgentWorkEventType.TOOL_COMPLETED;
    case AgentWorkEventType.INPUT_REQUESTED:
      return AgentWorkEventType.INPUT_REQUESTED;
    case AgentWorkEventType.INPUT_SUBMITTED:
      return AgentWorkEventType.INPUT_SUBMITTED;
    case AgentWorkEventType.COMPLETED:
      return AgentWorkEventType.COMPLETED;
    case AgentWorkEventType.FAILED:
      return AgentWorkEventType.FAILED;
    case AgentWorkEventType.CANCELLED:
      return AgentWorkEventType.CANCELLED;
    default:
      break;
  }

  switch (sourceEventType) {
    case 'tool.started':
    case 'tool.progress':
      return AgentWorkEventType.TOOL_STARTED;
    case 'tool.completed':
      return AgentWorkEventType.TOOL_COMPLETED;
    case 'input.requested':
      return AgentWorkEventType.INPUT_REQUESTED;
    case 'input.resolved':
      return AgentWorkEventType.INPUT_SUBMITTED;
    case 'run.completed':
    case 'work.completed':
      return AgentWorkEventType.COMPLETED;
    case 'run.failed':
      return AgentWorkEventType.FAILED;
    case 'run.cancelled':
      return AgentWorkEventType.CANCELLED;
    case 'thread.turn_started':
    case 'work.started':
    case 'work.updated':
      return AgentWorkEventType.STARTED;
    default:
      break;
  }

  switch (entry.kind) {
    case 'tool':
      return entry.status === 'completed' ||
        entry.status === 'failed' ||
        entry.status === 'cancelled'
        ? AgentWorkEventType.TOOL_COMPLETED
        : AgentWorkEventType.TOOL_STARTED;
    case 'input':
      return entry.status === 'completed'
        ? AgentWorkEventType.INPUT_SUBMITTED
        : AgentWorkEventType.INPUT_REQUESTED;
    case 'work':
      if (entry.status === 'completed') return AgentWorkEventType.COMPLETED;
      if (entry.status === 'failed') return AgentWorkEventType.FAILED;
      if (entry.status === 'cancelled') return AgentWorkEventType.CANCELLED;
      if (
        entry.label.toLowerCase().includes('completed') ||
        entry.label.toLowerCase() === 'run completed'
      ) {
        return AgentWorkEventType.COMPLETED;
      }
      if (entry.label.toLowerCase().includes('failed')) {
        return AgentWorkEventType.FAILED;
      }
      if (entry.label.toLowerCase().includes('cancelled')) {
        return AgentWorkEventType.CANCELLED;
      }
      return AgentWorkEventType.STARTED;
    case 'error':
      return AgentWorkEventType.FAILED;
    default:
      return null;
  }
}

function mapTimelineStatus(
  entry: AgentThreadSnapshot['timeline'][number],
): AgentWorkEventStatus {
  const status = entry.status?.toLowerCase();

  switch (status) {
    case 'completed':
    case 'succeeded':
    case 'success':
      return AgentWorkEventStatus.COMPLETED;
    case 'failed':
    case 'error':
      return AgentWorkEventStatus.FAILED;
    case 'cancelled':
    case 'canceled':
      return AgentWorkEventStatus.CANCELLED;
    case 'running':
      return AgentWorkEventStatus.RUNNING;
    case 'pending':
    case 'queued':
      return AgentWorkEventStatus.PENDING;
    default:
      break;
  }

  const sourceEventType = readPayloadString(entry, 'sourceEventType');

  switch (sourceEventType) {
    case 'tool.completed':
    case 'input.resolved':
    case 'run.completed':
    case 'work.completed':
      return AgentWorkEventStatus.COMPLETED;
    case 'run.failed':
    case 'error.raised':
      return AgentWorkEventStatus.FAILED;
    case 'run.cancelled':
      return AgentWorkEventStatus.CANCELLED;
    case 'tool.started':
    case 'tool.progress':
    case 'thread.turn_started':
    case 'work.started':
    case 'work.updated':
      return AgentWorkEventStatus.RUNNING;
    default:
      break;
  }

  const normalizedLabel = entry.label.toLowerCase();

  if (normalizedLabel.includes('completed')) {
    return AgentWorkEventStatus.COMPLETED;
  }
  if (normalizedLabel.includes('failed')) {
    return AgentWorkEventStatus.FAILED;
  }
  if (normalizedLabel.includes('cancelled')) {
    return AgentWorkEventStatus.CANCELLED;
  }

  return entry.kind === 'tool' || entry.kind === 'work'
    ? AgentWorkEventStatus.RUNNING
    : AgentWorkEventStatus.PENDING;
}

export function mapSnapshotWorkEvents(snapshot: AgentThreadSnapshot) {
  return snapshot.timeline
    .map((entry) => {
      const event = mapTimelineEventType(entry);
      if (!event) {
        return null;
      }

      const payloadToolName = readPayloadString(entry, 'toolName');
      const payloadToolCallId = readPayloadString(entry, 'toolCallId');
      const payloadInputRequestId = readPayloadString(entry, 'inputRequestId');
      const payloadStartedAt = readPayloadString(entry, 'startedAt');

      return {
        createdAt: entry.createdAt,
        debug: entry.payload?.debug as
          | import('@utils/progress/structured-progress-event.util').StructuredProgressDebugPayload
          | undefined,
        detail: entry.detail,
        estimatedDurationMs:
          typeof entry.payload?.estimatedDurationMs === 'number'
            ? entry.payload.estimatedDurationMs
            : undefined,
        event,
        id: entry.id,
        inputRequestId: entry.requestId ?? payloadInputRequestId,
        label: entry.label,
        parameters:
          entry.payload &&
          typeof entry.payload.parameters === 'object' &&
          entry.payload.parameters !== null
            ? (entry.payload.parameters as Record<string, unknown>)
            : undefined,
        phase:
          typeof entry.payload?.phase === 'string'
            ? entry.payload.phase
            : undefined,
        progress:
          typeof entry.payload?.progress === 'number'
            ? entry.payload.progress
            : undefined,
        remainingDurationMs:
          typeof entry.payload?.remainingDurationMs === 'number'
            ? entry.payload.remainingDurationMs
            : undefined,
        resultSummary:
          typeof entry.payload?.resultSummary === 'string'
            ? entry.payload.resultSummary
            : undefined,
        runId: entry.runId ?? undefined,
        startedAt: payloadStartedAt,
        status: mapTimelineStatus(entry),
        threadId: snapshot.threadId,
        toolCallId: payloadToolCallId,
        toolName: entry.toolName ?? payloadToolName,
      };
    })
    .filter((event): event is NonNullable<typeof event> => event !== null);
}

export function mapSnapshotPendingInputRequest(
  snapshot: AgentThreadSnapshot,
): AgentInputRequest | null {
  const pendingInputRequest = snapshot.pendingInputRequests.at(-1);

  if (!pendingInputRequest) {
    return null;
  }

  return {
    allowFreeText: pendingInputRequest.allowFreeText,
    fieldId: pendingInputRequest.fieldId,
    inputRequestId: pendingInputRequest.requestId,
    metadata: pendingInputRequest.metadata,
    options: pendingInputRequest.options,
    prompt: pendingInputRequest.prompt,
    recommendedOptionId: pendingInputRequest.recommendedOptionId,
    threadId: snapshot.threadId,
    title: pendingInputRequest.title,
  };
}

export function buildThreadSummaryFromSnapshot(
  snapshot: AgentThreadSnapshot,
  options?: {
    existingThread?: AgentThread;
    isVisible?: boolean;
    now?: string;
  },
): Pick<
  AgentThread,
  | 'attentionState'
  | 'lastActivityAt'
  | 'lastAssistantPreview'
  | 'pendingInputCount'
  | 'runStatus'
> {
  const now = options?.now ?? new Date().toISOString();
  const isVisible = options?.isVisible ?? false;
  const existingThread = options?.existingThread;
  const hasPendingInput = snapshot.pendingInputRequests.length > 0;
  const hasPendingPlanApproval = Boolean(
    snapshot.latestProposedPlan?.awaitingApproval,
  );
  const isRunning =
    snapshot.activeRun?.status === 'queued' ||
    snapshot.activeRun?.status === 'running';
  const hasAssistantUpdate = Boolean(snapshot.lastAssistantMessage);

  return {
    attentionState:
      hasPendingInput || hasPendingPlanApproval
        ? 'needs-input'
        : isRunning
          ? isVisible
            ? null
            : 'running'
          : hasAssistantUpdate && !isVisible
            ? 'updated'
            : null,
    lastActivityAt:
      snapshot.lastAssistantMessage?.createdAt ??
      snapshot.activeRun?.completedAt ??
      snapshot.activeRun?.startedAt ??
      existingThread?.lastActivityAt ??
      existingThread?.updatedAt ??
      now,
    lastAssistantPreview:
      snapshot.lastAssistantMessage?.content.slice(0, 280) ??
      existingThread?.lastAssistantPreview,
    pendingInputCount:
      snapshot.pendingInputRequests.length + (hasPendingPlanApproval ? 1 : 0),
    runStatus:
      hasPendingInput || hasPendingPlanApproval
        ? 'waiting_input'
        : ((snapshot.activeRun?.status as AgentThread['runStatus']) ?? 'idle'),
  };
}
