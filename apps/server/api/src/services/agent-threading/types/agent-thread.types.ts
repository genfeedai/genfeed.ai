import type { AgentDashboardOperation } from '@genfeedai/interfaces';

export const AGENT_THREAD_EVENT_TYPES = [
  'thread.turn_requested',
  'thread.turn_started',
  'assistant.delta',
  'assistant.finalized',
  'tool.started',
  'tool.progress',
  'tool.completed',
  'input.requested',
  'input.resolved',
  'plan.upserted',
  'ui.blocks_updated',
  'run.cancelled',
  'run.completed',
  'run.failed',
  'memory.flushed',
  'work.started',
  'work.updated',
  'work.completed',
  'error.raised',
] as const;

export type AgentThreadEventType = (typeof AGENT_THREAD_EVENT_TYPES)[number];

export const AGENT_THREAD_TIMELINE_ENTRY_KINDS = [
  'assistant',
  'input',
  'message',
  'plan',
  'tool',
  'work',
  'system',
  'error',
] as const;

export type AgentThreadTimelineEntryKind =
  (typeof AGENT_THREAD_TIMELINE_ENTRY_KINDS)[number];

export const AGENT_SESSION_BINDING_STATUSES = [
  'idle',
  'running',
  'waiting_input',
  'completed',
  'failed',
  'cancelled',
] as const;

export type AgentSessionBindingStatus =
  (typeof AGENT_SESSION_BINDING_STATUSES)[number];

export const AGENT_INPUT_REQUEST_STATUSES = ['pending', 'resolved'] as const;

export type AgentInputRequestStatus =
  (typeof AGENT_INPUT_REQUEST_STATUSES)[number];

export interface AgentPendingApproval {
  requestId: string;
  requestKind: string;
  detail?: string;
  createdAt: string;
}

export interface AgentInputOption {
  id: string;
  label: string;
  description?: string;
}

export interface AgentPendingInputRequest {
  requestId: string;
  title: string;
  prompt: string;
  allowFreeText?: boolean;
  recommendedOptionId?: string;
  options: AgentInputOption[];
  fieldId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface AgentThreadActiveRun {
  runId: string;
  model?: string;
  status: string;
  startedAt?: string;
  completedAt?: string;
}

export interface AgentThreadLatestPlan {
  id: string;
  explanation?: string;
  createdAt: string;
  updatedAt: string;
  content?: string;
  steps?: Record<string, unknown>[];
  status?: string;
  awaitingApproval?: boolean;
  lastReviewAction?: string;
  revisionNote?: string;
  approvedAt?: string;
}

export interface AgentThreadUiBlocksState {
  operation: AgentDashboardOperation | string;
  blocks?: Record<string, unknown>[];
  blockIds?: string[];
  updatedAt?: string;
}

export interface AgentThreadLastAssistantMessage {
  messageId: string;
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface AgentThreadTimelineEntry {
  id: string;
  kind: AgentThreadTimelineEntryKind;
  label: string;
  detail?: string;
  status?: string;
  runId?: string;
  toolName?: string;
  requestId?: string;
  role?: string;
  payload?: Record<string, unknown>;
  createdAt: string;
  sequence: number;
}
