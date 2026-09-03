import { randomUUID } from 'node:crypto';
import { get, patch, post } from '@/api/client';
import {
  flattenCollection,
  flattenSingle,
  type JsonApiCollectionResponse,
  type JsonApiSingleResponse,
} from '@/api/json-api';

const AGENT_THREADS_ENDPOINT = '/agent/threads';

export interface AgentThread {
  id: string;
  brandId?: string | null;
  contextVersion: number;
  attentionState?: string | null;
  isPinned?: boolean;
  lastActivityAt?: string;
  lastAssistantPreview?: string;
  pendingInputCount?: number;
  runStatus?: string | null;
  source?: string;
  status?: string;
  title?: string;
}

export interface AgentThreadMessage {
  id: string;
  content?: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
  role?: string;
}

export interface AgentThreadEvent {
  commandId: string;
  eventId: string;
  metadata?: Record<string, unknown>;
  occurredAt?: string | null;
  payload?: Record<string, unknown>;
  runId?: string | null;
  sequence: number;
  threadId: string;
  type: string;
  userId?: string | null;
}

export interface AgentPendingInputRequest {
  allowFreeText?: boolean;
  createdAt?: string;
  fieldId?: string;
  metadata?: Record<string, unknown>;
  options?: Array<{
    description?: string;
    id: string;
    label: string;
  }>;
  prompt: string;
  recommendedOptionId?: string;
  requestId: string;
  title: string;
}

export interface AgentChatAttachment {
  ingredientId?: string;
  kind?: string;
  name?: string;
  url?: string;
}

export interface AgentChatRequest {
  attachments?: AgentChatAttachment[];
  clientRequestId?: string;
  content: string;
  brandId?: string | null;
  expectedContextVersion?: number;
  hostSupportsApproval?: boolean;
  model?: string;
  source?: 'agent' | 'onboarding' | 'proactive';
  threadId?: string;
}

export interface AgentThreadSnapshot {
  activeRun?: {
    completedAt?: string;
    model?: string;
    runId: string;
    startedAt?: string;
    status: string;
  } | null;
  lastAssistantMessage?: {
    content: string;
    createdAt: string;
    messageId: string;
    metadata?: Record<string, unknown>;
  } | null;
  lastSequence: number;
  latestProposedPlan?: {
    content?: string;
    createdAt: string;
    explanation?: string;
    id: string;
    steps?: Record<string, unknown>[];
    updatedAt: string;
  } | null;
  latestUiBlocks?: {
    blockIds?: string[];
    blocks?: Record<string, unknown>[];
    operation: string;
    updatedAt?: string;
  } | null;
  pendingInputRequests: AgentPendingInputRequest[];
  threadId: string;
  threadStatus?: string | null;
  timeline: Array<Record<string, unknown>>;
  title?: string | null;
}

export interface AgentChatStreamStartResponse {
  brandId?: string;
  contextVersion: number;
  runId: string;
  startedAt: string;
  threadId: string;
}

export interface RespondToInputRequestResponse {
  answer: string | null;
  fieldId: string | null;
  requestId: string;
  resolvedAt: string | null;
  status: string;
  threadId: string;
}

export async function listThreads(status?: string): Promise<AgentThread[]> {
  const query = new URLSearchParams();
  if (status) {
    query.set('status', status);
  }

  const qs = query.toString();
  const response = await get<JsonApiCollectionResponse>(
    qs ? `${AGENT_THREADS_ENDPOINT}?${qs}` : AGENT_THREADS_ENDPOINT
  );
  return flattenCollection<AgentThread>(response);
}

export async function getThread(threadId: string, signal?: AbortSignal): Promise<AgentThread> {
  const path = `${AGENT_THREADS_ENDPOINT}/${threadId}`;
  const response = signal
    ? await get<JsonApiSingleResponse>(path, { signal })
    : await get<JsonApiSingleResponse>(path);
  return flattenSingle<AgentThread>(response);
}

export async function getThreadMessages(
  threadId: string,
  limit = 20
): Promise<AgentThreadMessage[]> {
  const response = await get<JsonApiCollectionResponse>(
    `${AGENT_THREADS_ENDPOINT}/${threadId}/messages?limit=${limit}`
  );
  return flattenCollection<AgentThreadMessage>(response);
}

export async function archiveThread(threadId: string): Promise<AgentThread> {
  const response = await patch<JsonApiSingleResponse>(`${AGENT_THREADS_ENDPOINT}/${threadId}`, {
    status: 'archived',
  });
  return flattenSingle<AgentThread>(response);
}

export async function updateThreadContext(
  threadId: string,
  input: { brandId?: string | null; expectedContextVersion: number }
): Promise<AgentThread> {
  const response = await patch<JsonApiSingleResponse>(
    `${AGENT_THREADS_ENDPOINT}/${threadId}/context`,
    input
  );
  return flattenSingle<AgentThread>(response);
}

export async function getThreadSnapshot(
  threadId: string,
  signal?: AbortSignal
): Promise<AgentThreadSnapshot> {
  const path = `${AGENT_THREADS_ENDPOINT}/${threadId}/snapshot`;
  return signal
    ? await get<AgentThreadSnapshot>(path, { signal })
    : await get<AgentThreadSnapshot>(path);
}

export async function getThreadEvents(
  threadId: string,
  afterSequence?: number,
  signal?: AbortSignal
): Promise<AgentThreadEvent[]> {
  const query = new URLSearchParams();
  if (typeof afterSequence === 'number' && afterSequence > 0) {
    query.set('afterSequence', String(afterSequence));
  }

  const qs = query.toString();
  const path = qs
    ? `${AGENT_THREADS_ENDPOINT}/${threadId}/events?${qs}`
    : `${AGENT_THREADS_ENDPOINT}/${threadId}/events`;
  return signal
    ? await get<AgentThreadEvent[]>(path, { signal })
    : await get<AgentThreadEvent[]>(path);
}

export async function respondToInputRequest(
  threadId: string,
  requestId: string,
  answer: string,
  scope?: { brandId?: string | null; expectedContextVersion?: number },
  signal?: AbortSignal
): Promise<RespondToInputRequestResponse> {
  const path = `${AGENT_THREADS_ENDPOINT}/${threadId}/input-requests/${requestId}/responses`;
  const body = { answer, ...(scope ?? {}) };
  return signal
    ? await post<RespondToInputRequestResponse>(path, body, { signal })
    : await post<RespondToInputRequestResponse>(path, body);
}

export async function startAgentChatStream(
  request: AgentChatRequest,
  signal?: AbortSignal
): Promise<AgentChatStreamStartResponse> {
  const body = {
    attachments: request.attachments,
    brandId: request.brandId,
    clientRequestId: request.clientRequestId ?? randomUUID(),
    content: request.content,
    expectedContextVersion: request.expectedContextVersion,
    hostSupportsApproval: request.hostSupportsApproval ?? false,
    model: request.model,
    source: request.source ?? 'agent',
  };
  const endpoint = request.threadId
    ? `${AGENT_THREADS_ENDPOINT}/${request.threadId}/turns/stream`
    : `${AGENT_THREADS_ENDPOINT}/turns/stream`;

  return signal
    ? await post<AgentChatStreamStartResponse>(endpoint, body, { signal })
    : await post<AgentChatStreamStartResponse>(endpoint, body);
}
