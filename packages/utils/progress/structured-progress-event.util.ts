import type { IBackgroundTaskUpdateEvent } from '@genfeedai/interfaces';

export type StructuredProgressStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface StructuredProgressDebugPayload {
  error?: string;
  parameters?: Record<string, unknown>;
  rawOutput?: string;
  result?: unknown;
}

export interface StructuredProgressEvent {
  debug?: StructuredProgressDebugPayload;
  detail?: string;
  estimatedDurationMs?: number;
  id: string;
  label: string;
  phase?: string;
  progress?: number;
  remainingDurationMs?: number;
  runId?: string;
  startedAt?: string;
  status: StructuredProgressStatus;
  taskId?: string;
  threadId?: string;
  toolCallId?: string;
  toolName?: string;
}

export interface AgentStructuredProgressEventInput {
  debug?: StructuredProgressDebugPayload;
  detail?: string;
  estimatedDurationMs?: number;
  event: string;
  inputRequestId?: string;
  label: string;
  phase?: string;
  progress?: number;
  remainingDurationMs?: number;
  runId?: string;
  startedAt?: string;
  status: StructuredProgressStatus;
  threadId: string;
  timestamp: string;
  toolCallId?: string;
  toolName?: string;
}

function normalizeLabel(label: string, fallback: string): string {
  const trimmed = label.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

export function normalizeAgentStructuredProgressEvent(
  input: AgentStructuredProgressEventInput,
): StructuredProgressEvent {
  return {
    debug: input.debug,
    detail: input.detail,
    estimatedDurationMs: input.estimatedDurationMs,
    id: `${input.event}-${input.toolCallId ?? input.inputRequestId ?? input.timestamp}`,
    label: normalizeLabel(input.label, input.toolName ?? 'Working'),
    phase: input.phase,
    progress: input.progress,
    remainingDurationMs: input.remainingDurationMs,
    runId: input.runId,
    startedAt: input.startedAt,
    status: input.status,
    threadId: input.threadId,
    toolCallId: input.toolCallId,
    toolName: input.toolName,
  };
}

function normalizeBackgroundTaskStatus(
  status: IBackgroundTaskUpdateEvent['status'],
): StructuredProgressStatus {
  if (status === 'processing') {
    return 'running';
  }

  return status;
}

export function normalizeBackgroundStructuredProgressEvent(
  event: IBackgroundTaskUpdateEvent,
): StructuredProgressEvent {
  return {
    detail: event.error,
    estimatedDurationMs: event.estimatedDurationMs,
    id: `background-${event.taskId}`,
    label: normalizeLabel(event.label ?? '', 'Background task'),
    phase: event.currentPhase,
    progress: event.progress,
    remainingDurationMs: event.remainingDurationMs,
    startedAt: event.startedAt,
    status: normalizeBackgroundTaskStatus(event.status),
    taskId: event.taskId,
  };
}
