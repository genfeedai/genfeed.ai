import { get, patch, post } from '@/api/client.js';
import {
  flattenCollection,
  flattenSingle,
  type JsonApiCollectionResponse,
  type JsonApiSingleResponse,
} from '@/api/json-api.js';

export interface AgentThread {
  id: string;
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
  content: string;
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
  const response = await get<JsonApiCollectionResponse>(qs ? `/threads?${qs}` : '/threads');
  return flattenCollection<AgentThread>(response);
}

export async function getThread(threadId: string): Promise<AgentThread> {
  const response = await get<JsonApiSingleResponse>(`/threads/${threadId}`);
  return flattenSingle<AgentThread>(response);
}

export async function getThreadMessages(
  threadId: string,
  limit = 20
): Promise<AgentThreadMessage[]> {
  const response = await get<JsonApiCollectionResponse>(
    `/threads/${threadId}/messages?limit=${limit}`
  );
  return flattenCollection<AgentThreadMessage>(response);
}

export async function archiveThread(threadId: string): Promise<AgentThread> {
  const response = await patch<JsonApiSingleResponse>(`/threads/${threadId}`, {
    status: 'archived',
  });
  return flattenSingle<AgentThread>(response);
}

export async function getThreadSnapshot(threadId: string): Promise<AgentThreadSnapshot> {
  return await get<AgentThreadSnapshot>(`/threads/${threadId}/snapshot`);
}

export async function getThreadEvents(
  threadId: string,
  afterSequence?: number
): Promise<AgentThreadEvent[]> {
  const query = new URLSearchParams();
  if (typeof afterSequence === 'number' && afterSequence > 0) {
    query.set('afterSequence', String(afterSequence));
  }

  const qs = query.toString();
  return await get<AgentThreadEvent[]>(
    qs ? `/threads/${threadId}/events?${qs}` : `/threads/${threadId}/events`
  );
}

export async function respondToInputRequest(
  threadId: string,
  requestId: string,
  answer: string
): Promise<RespondToInputRequestResponse> {
  return await post<RespondToInputRequestResponse>(
    `/threads/${threadId}/input-requests/${requestId}/responses`,
    { answer }
  );
}

export async function startAgentChatStream(
  request: AgentChatRequest
): Promise<AgentChatStreamStartResponse> {
  return await post<AgentChatStreamStartResponse>('/agent/chat/stream', {
    attachments: request.attachments,
    content: request.content,
    model: request.model,
    source: request.source ?? 'agent',
    threadId: request.threadId,
  });
}
