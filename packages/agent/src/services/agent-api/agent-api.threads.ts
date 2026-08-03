import type {
  AgentChatMessage,
  AgentChatPayload,
  AgentChatResponse,
  AgentChatStreamResponse,
  AgentThread,
  AgentThreadSnapshot,
  CreateThreadPayload,
  SendMessagePayload,
  UpdateAgentThreadContextPayload,
} from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiError } from '@genfeedai/agent/services/agent-api-error';
import type { AgentBaseApiService } from '@genfeedai/agent/services/agent-base-api.service';
import { AgentThreadStatus } from '@genfeedai/enums';
import type { AgentScopePayload } from '@genfeedai/interfaces';
import { Effect } from 'effect';

export const AGENT_THREADS_ENDPOINT = '/agent/threads';

export function createThreadEffect(
  api: AgentBaseApiService,
  payload: CreateThreadPayload,
  signal?: AbortSignal,
): Effect.Effect<AgentThread, AgentApiError> {
  return api.fetchResourceEffect<AgentThread>(
    `${api.config.baseUrl}${AGENT_THREADS_ENDPOINT}`,
    { body: JSON.stringify(payload), method: 'POST', signal },
    'Failed to create thread',
    'Failed to deserialize thread',
  );
}

export function sendMessageEffect(
  api: AgentBaseApiService,
  payload: SendMessagePayload,
  signal?: AbortSignal,
): Effect.Effect<AgentChatMessage, AgentApiError> {
  const { threadId, ...body } = payload;
  return api
    .fetchResourceEffect<AgentChatMessage>(
      `${api.config.baseUrl}${AGENT_THREADS_ENDPOINT}/${threadId}/messages`,
      { body: JSON.stringify(body), method: 'POST', signal },
      'Failed to send message',
      'Failed to deserialize thread message',
    )
    .pipe(
      Effect.map((message) => ({
        ...message,
        threadId,
      })),
    );
}

export function chatEffect(
  api: AgentBaseApiService,
  payload: AgentChatPayload,
  signal?: AbortSignal,
): Effect.Effect<AgentChatResponse, AgentApiError> {
  const { threadId, ...body } = payload;
  const endpoint = threadId
    ? `${AGENT_THREADS_ENDPOINT}/${threadId}/turns`
    : `${AGENT_THREADS_ENDPOINT}/turns`;

  return api.fetchJsonEffect<AgentChatResponse>(
    `${api.config.baseUrl}${endpoint}`,
    { body: JSON.stringify(body), method: 'POST', signal },
    'Agent chat failed',
  );
}

export function chatStreamEffect(
  api: AgentBaseApiService,
  payload: AgentChatPayload,
  signal?: AbortSignal,
): Effect.Effect<AgentChatStreamResponse, AgentApiError> {
  const { threadId, ...body } = payload;
  const endpoint = threadId
    ? `${AGENT_THREADS_ENDPOINT}/${threadId}/turns/stream`
    : `${AGENT_THREADS_ENDPOINT}/turns/stream`;

  return api.fetchJsonEffect<AgentChatStreamResponse>(
    `${api.config.baseUrl}${endpoint}`,
    { body: JSON.stringify(body), method: 'POST', signal },
    'Agent chat stream failed',
  );
}

export function getThreadsEffect(
  api: AgentBaseApiService,
  params?: {
    page?: number;
    limit?: number;
    status?: AgentThreadStatus;
    /** When set, list is single-brand only. Omit for full org. */
    brandId?: string | null;
  },
  signal?: AbortSignal,
): Effect.Effect<AgentThread[], AgentApiError> {
  const qs = new URLSearchParams();
  if (params?.page) {
    qs.set('page', String(params.page));
  }
  if (params?.limit) {
    qs.set('limit', String(params.limit));
  }
  if (params?.status) {
    qs.set('status', params.status);
  }
  if (params?.brandId) {
    qs.set('brand', params.brandId);
  }
  const queryString = qs.toString();
  return api.fetchCollectionEffect<AgentThread>(
    `${api.config.baseUrl}${AGENT_THREADS_ENDPOINT}${
      queryString ? `?${queryString}` : ''
    }`,
    { signal },
    'Failed to fetch threads',
    'Failed to deserialize thread collection',
  );
}

export function archiveAllThreadsEffect(
  api: AgentBaseApiService,
  brandId?: string | null,
  signal?: AbortSignal,
): Effect.Effect<{ archivedCount: number }, AgentApiError> {
  return api.fetchJsonEffect<{ archivedCount: number }>(
    `${api.config.baseUrl}${AGENT_THREADS_ENDPOINT}`,
    {
      body: JSON.stringify({
        status: AgentThreadStatus.ARCHIVED,
        ...(brandId ? { brandId } : {}),
      }),
      method: 'PATCH',
      signal,
    },
    'Failed to archive all threads',
  );
}

export function archiveThreadEffect(
  api: AgentBaseApiService,
  threadId: string,
  signal?: AbortSignal,
): Effect.Effect<AgentThread, AgentApiError> {
  return updateThreadEffect(
    api,
    threadId,
    { status: AgentThreadStatus.ARCHIVED },
    signal,
  );
}

export function unarchiveThreadEffect(
  api: AgentBaseApiService,
  threadId: string,
  signal?: AbortSignal,
): Effect.Effect<AgentThread, AgentApiError> {
  return updateThreadEffect(
    api,
    threadId,
    { status: AgentThreadStatus.ACTIVE },
    signal,
  );
}

export function getThreadEffect(
  api: AgentBaseApiService,
  threadId: string,
  signal?: AbortSignal,
): Effect.Effect<AgentThread, AgentApiError> {
  return api.fetchResourceEffect<AgentThread>(
    `${api.config.baseUrl}${AGENT_THREADS_ENDPOINT}/${threadId}`,
    { signal },
    'Failed to fetch thread',
    'Failed to deserialize thread',
  );
}

export function getThreadSnapshotEffect(
  api: AgentBaseApiService,
  threadId: string,
  signal?: AbortSignal,
): Effect.Effect<AgentThreadSnapshot, AgentApiError> {
  return api.fetchJsonEffect<AgentThreadSnapshot>(
    `${api.config.baseUrl}${AGENT_THREADS_ENDPOINT}/${threadId}/snapshot`,
    { signal },
    'Failed to fetch thread snapshot',
  );
}

export function updateThreadEffect(
  api: AgentBaseApiService,
  threadId: string,
  payload: {
    isPinned?: boolean;
    planModeEnabled?: boolean;
    requestedModel?: string;
    runtimeKey?: string;
    title?: string;
    systemPrompt?: string;
    memoryEntryIds?: string[];
    status?: AgentThreadStatus;
  },
  signal?: AbortSignal,
): Effect.Effect<AgentThread, AgentApiError> {
  return api.fetchResourceEffect<AgentThread>(
    `${api.config.baseUrl}${AGENT_THREADS_ENDPOINT}/${threadId}`,
    { body: JSON.stringify(payload), method: 'PATCH', signal },
    'Failed to update thread',
    'Failed to deserialize thread',
  );
}

export function updateThreadContextEffect(
  api: AgentBaseApiService,
  threadId: string,
  payload: UpdateAgentThreadContextPayload,
  signal?: AbortSignal,
): Effect.Effect<AgentThread, AgentApiError> {
  return api.fetchResourceEffect<AgentThread>(
    `${api.config.baseUrl}${AGENT_THREADS_ENDPOINT}/${threadId}/context`,
    { body: JSON.stringify(payload), method: 'PATCH', signal },
    'Failed to update thread context',
    'Failed to deserialize thread context',
  );
}

export function branchThreadEffect(
  api: AgentBaseApiService,
  threadId: string,
  signal?: AbortSignal,
): Effect.Effect<AgentThread, AgentApiError> {
  return api.fetchResourceEffect<AgentThread>(
    `${api.config.baseUrl}${AGENT_THREADS_ENDPOINT}/${threadId}/branches`,
    { method: 'POST', signal },
    'Failed to branch thread',
    'Failed to deserialize thread branch',
  );
}

export function respondToInputRequestEffect(
  api: AgentBaseApiService,
  threadId: string,
  requestId: string,
  answer: string,
  signal?: AbortSignal,
  scope?: AgentScopePayload,
): Effect.Effect<
  {
    answer: string | null;
    requestId: string;
    resolvedAt: string | null;
    status: string;
    threadId: string;
  },
  AgentApiError
> {
  return api.fetchJsonEffect<{
    answer: string | null;
    requestId: string;
    resolvedAt: string | null;
    status: string;
    threadId: string;
  }>(
    `${api.config.baseUrl}${AGENT_THREADS_ENDPOINT}/${threadId}/input-requests/${requestId}/responses`,
    {
      body: JSON.stringify({ answer, ...(scope ?? {}) }),
      method: 'POST',
      signal,
    },
    'Failed to respond to input request',
  );
}

export function respondToUiActionEffect(
  api: AgentBaseApiService,
  threadId: string,
  action: string,
  payload?: Record<string, unknown>,
  signal?: AbortSignal,
  scope?: AgentScopePayload,
): Effect.Effect<AgentChatResponse, AgentApiError> {
  return api.fetchJsonEffect<AgentChatResponse>(
    `${api.config.baseUrl}${AGENT_THREADS_ENDPOINT}/${threadId}/ui-actions`,
    {
      body: JSON.stringify({ action, payload, ...(scope ?? {}) }),
      method: 'POST',
      signal,
    },
    'Failed to respond to UI action',
  );
}

export function pinThreadEffect(
  api: AgentBaseApiService,
  threadId: string,
  signal?: AbortSignal,
): Effect.Effect<AgentThread, AgentApiError> {
  return updateThreadEffect(api, threadId, { isPinned: true }, signal);
}

export function unpinThreadEffect(
  api: AgentBaseApiService,
  threadId: string,
  signal?: AbortSignal,
): Effect.Effect<AgentThread, AgentApiError> {
  return updateThreadEffect(api, threadId, { isPinned: false }, signal);
}

export function getMessagesEffect(
  api: AgentBaseApiService,
  threadId: string,
  params?: { page?: number; limit?: number },
  signal?: AbortSignal,
): Effect.Effect<AgentChatMessage[], AgentApiError> {
  const qs = new URLSearchParams();
  if (params?.page) {
    qs.set('page', String(params.page));
  }
  if (params?.limit) {
    qs.set('limit', String(params.limit));
  }
  const queryString = qs.toString();
  return api
    .fetchCollectionEffect<AgentChatMessage>(
      `${api.config.baseUrl}${AGENT_THREADS_ENDPOINT}/${threadId}/messages${
        queryString ? `?${queryString}` : ''
      }`,
      { signal },
      'Failed to fetch messages',
      'Failed to deserialize thread messages',
    )
    .pipe(
      Effect.map((messages) =>
        messages.map((message) => ({
          ...message,
          threadId,
        })),
      ),
    );
}
