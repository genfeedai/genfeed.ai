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
import { AgentApiRequestError } from '@genfeedai/agent/services/agent-api-error';
import type { AgentBaseApiService } from '@genfeedai/agent/services/agent-base-api.service';
import { AgentThreadStatus } from '@genfeedai/contracts';
import type {
  AgentScopePayload,
  AgentTransferPresentation,
  IAgentTransfer,
} from '@genfeedai/contracts/interfaces';

export const AGENT_THREADS_ENDPOINT = '/agent/threads';

export interface AgentMessagesPage {
  hasMore: boolean;
  messages: AgentChatMessage[];
  nextCursor: string | null;
}

type GetMessagesParams = {
  cursor?: string;
  limit?: number;
};

function buildMessagesUrl(
  api: AgentBaseApiService,
  threadId: string,
  params?: GetMessagesParams,
): string {
  const qs = new URLSearchParams();
  if (params?.cursor) {
    qs.set('cursor', params.cursor);
  }
  if (params?.limit) {
    qs.set('limit', String(params.limit));
  }
  const queryString = qs.toString();

  return `${api.config.baseUrl}${AGENT_THREADS_ENDPOINT}/${threadId}/messages${
    queryString ? `?${queryString}` : ''
  }`;
}

function mapMessagesToThread(
  messages: AgentChatMessage[],
  threadId: string,
): AgentChatMessage[] {
  return messages.map((message) => ({
    ...message,
    threadId,
  }));
}

function hydrateTransferCards(
  messages: AgentChatMessage[],
  transfers: IAgentTransfer[],
  threadId: string,
): AgentChatMessage[] {
  const byId = new Map(transfers.map((transfer) => [transfer.id, transfer]));
  const byIdempotencyKey = new Map(
    transfers.map((transfer) => [transfer.idempotencyKey, transfer]),
  );
  return mapMessagesToThread(messages, threadId).map((message) => {
    const marker = message.metadata?.agentTransfer;
    const markedTransfer = marker ? byId.get(marker.transferId) : undefined;
    const presentation = markedTransfer
      ? ({
          ...markedTransfer,
          direction:
            marker?.direction ??
            (markedTransfer.sourceThreadId === threadId
              ? 'outbound'
              : 'inbound'),
        } satisfies AgentTransferPresentation)
      : undefined;
    const uiActions = message.metadata?.uiActions?.map((action) => {
      if (action.type !== 'agent_transfer_card') {
        return action;
      }
      const idempotencyKey =
        typeof action.data?.idempotencyKey === 'string'
          ? action.data.idempotencyKey
          : undefined;
      const transfer = idempotencyKey
        ? byIdempotencyKey.get(idempotencyKey)
        : undefined;
      return transfer
        ? {
            ...action,
            data: {
              ...(action.data ?? {}),
              transfer: {
                ...transfer,
                direction:
                  transfer.sourceThreadId === threadId ? 'outbound' : 'inbound',
              },
            },
          }
        : action;
    });
    return {
      ...message,
      metadata: {
        ...(message.metadata ?? {}),
        ...(marker
          ? {
              agentTransfer: {
                ...marker,
                ...(presentation ? { transfer: presentation } : {}),
              },
            }
          : {}),
        ...(uiActions ? { uiActions } : {}),
      },
    };
  });
}

async function getTransfers(
  api: AgentBaseApiService,
  threadId: string,
  signal?: AbortSignal,
): Promise<IAgentTransfer[]> {
  try {
    return await api.fetchCollection<IAgentTransfer>(
      `${api.config.baseUrl}/agent/transfers?threadId=${encodeURIComponent(threadId)}`,
      { signal },
      'Failed to fetch conversation transfers',
      'Failed to deserialize conversation transfers',
    );
  } catch {
    return [];
  }
}

export async function retryAgentTransfer(
  api: AgentBaseApiService,
  transferId: string,
  signal?: AbortSignal,
): Promise<IAgentTransfer> {
  return api.fetchResource<IAgentTransfer>(
    `${api.config.baseUrl}/agent/transfers/${encodeURIComponent(transferId)}/retry`,
    { method: 'POST', signal },
    'Failed to retry conversation transfer',
    'Failed to deserialize conversation transfer',
  );
}

export async function createThread(
  api: AgentBaseApiService,
  payload: CreateThreadPayload,
  signal?: AbortSignal,
): Promise<AgentThread> {
  return api.fetchResource<AgentThread>(
    `${api.config.baseUrl}${AGENT_THREADS_ENDPOINT}`,
    { body: JSON.stringify(payload), method: 'POST', signal },
    'Failed to create thread',
    'Failed to deserialize thread',
  );
}

export async function sendMessage(
  api: AgentBaseApiService,
  payload: SendMessagePayload,
  signal?: AbortSignal,
): Promise<AgentChatMessage> {
  const { threadId, ...body } = payload;
  const message = await api.fetchResource<AgentChatMessage>(
    `${api.config.baseUrl}${AGENT_THREADS_ENDPOINT}/${threadId}/messages`,
    { body: JSON.stringify(body), method: 'POST', signal },
    'Failed to send message',
    'Failed to deserialize thread message',
  );

  return { ...message, threadId };
}

export async function chat(
  api: AgentBaseApiService,
  payload: AgentChatPayload,
  signal?: AbortSignal,
): Promise<AgentChatResponse> {
  const { threadId, ...body } = payload;
  const endpoint = threadId
    ? `${AGENT_THREADS_ENDPOINT}/${threadId}/turns`
    : `${AGENT_THREADS_ENDPOINT}/turns`;

  return api.fetchJson<AgentChatResponse>(
    `${api.config.baseUrl}${endpoint}`,
    { body: JSON.stringify(body), method: 'POST', signal },
    'Agent chat failed',
  );
}

export async function chatStream(
  api: AgentBaseApiService,
  payload: AgentChatPayload,
  signal?: AbortSignal,
): Promise<AgentChatStreamResponse> {
  const { threadId, ...body } = payload;
  const endpoint = threadId
    ? `${AGENT_THREADS_ENDPOINT}/${threadId}/turns/stream`
    : `${AGENT_THREADS_ENDPOINT}/turns/stream`;

  try {
    return await api.fetchJson<AgentChatStreamResponse>(
      `${api.config.baseUrl}${endpoint}`,
      { body: JSON.stringify(body), method: 'POST', signal },
      'Agent chat stream failed',
    );
  } catch (error) {
    if (error instanceof AgentApiRequestError) {
      throw new AgentApiRequestError({
        detail: error.detail,
        message: error.message,
        source:
          error.status === 408 || error.status === 504
            ? 'acknowledgement'
            : error.source,
        status: error.status,
      });
    }
    throw error;
  }
}

export async function getThreads(
  api: AgentBaseApiService,
  params?: {
    page?: number;
    limit?: number;
    status?: AgentThreadStatus;
    /** When set, list is single-brand only. Omit for full org. */
    brandId?: string | null;
    /**
     * When set, list is narrowed server-side to threads opened from that entry
     * point (`onboarding`, `agent`, `proactive`).
     */
    source?: string | null;
  },
  signal?: AbortSignal,
): Promise<AgentThread[]> {
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
  if (params?.source) {
    qs.set('source', params.source);
  }
  const queryString = qs.toString();
  return api.fetchCollection<AgentThread>(
    `${api.config.baseUrl}${AGENT_THREADS_ENDPOINT}${
      queryString ? `?${queryString}` : ''
    }`,
    { signal },
    'Failed to fetch threads',
    'Failed to deserialize thread collection',
  );
}

export async function archiveAllThreads(
  api: AgentBaseApiService,
  brandId?: string | null,
  signal?: AbortSignal,
): Promise<{ archivedCount: number }> {
  return api.fetchJson<{ archivedCount: number }>(
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

export async function archiveThread(
  api: AgentBaseApiService,
  threadId: string,
  signal?: AbortSignal,
): Promise<AgentThread> {
  return updateThread(
    api,
    threadId,
    { status: AgentThreadStatus.ARCHIVED },
    signal,
  );
}

export async function unarchiveThread(
  api: AgentBaseApiService,
  threadId: string,
  signal?: AbortSignal,
): Promise<AgentThread> {
  return updateThread(
    api,
    threadId,
    { status: AgentThreadStatus.ACTIVE },
    signal,
  );
}

export async function getThread(
  api: AgentBaseApiService,
  threadId: string,
  signal?: AbortSignal,
): Promise<AgentThread> {
  return api.fetchResource<AgentThread>(
    `${api.config.baseUrl}${AGENT_THREADS_ENDPOINT}/${threadId}`,
    { signal },
    'Failed to fetch thread',
    'Failed to deserialize thread',
  );
}

export async function getThreadSnapshot(
  api: AgentBaseApiService,
  threadId: string,
  signal?: AbortSignal,
): Promise<AgentThreadSnapshot> {
  return api.fetchJson<AgentThreadSnapshot>(
    `${api.config.baseUrl}${AGENT_THREADS_ENDPOINT}/${threadId}/snapshot`,
    { signal },
    'Failed to fetch thread snapshot',
  );
}

export async function updateThread(
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
): Promise<AgentThread> {
  return api.fetchResource<AgentThread>(
    `${api.config.baseUrl}${AGENT_THREADS_ENDPOINT}/${threadId}`,
    { body: JSON.stringify(payload), method: 'PATCH', signal },
    'Failed to update thread',
    'Failed to deserialize thread',
  );
}

export async function updateThreadContext(
  api: AgentBaseApiService,
  threadId: string,
  payload: UpdateAgentThreadContextPayload,
  signal?: AbortSignal,
): Promise<AgentThread> {
  return api.fetchResource<AgentThread>(
    `${api.config.baseUrl}${AGENT_THREADS_ENDPOINT}/${threadId}/context`,
    { body: JSON.stringify(payload), method: 'PATCH', signal },
    'Failed to update thread context',
    'Failed to deserialize thread context',
  );
}

export async function branchThread(
  api: AgentBaseApiService,
  threadId: string,
  signal?: AbortSignal,
): Promise<AgentThread> {
  return api.fetchResource<AgentThread>(
    `${api.config.baseUrl}${AGENT_THREADS_ENDPOINT}/${threadId}/branches`,
    { method: 'POST', signal },
    'Failed to branch thread',
    'Failed to deserialize thread branch',
  );
}

export async function respondToInputRequest(
  api: AgentBaseApiService,
  threadId: string,
  requestId: string,
  answer: string,
  signal?: AbortSignal,
  scope?: AgentScopePayload,
): Promise<{
  answer: string | null;
  requestId: string;
  resolvedAt: string | null;
  status: string;
  threadId: string;
}> {
  return api.fetchJson<{
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

export async function respondToUiAction(
  api: AgentBaseApiService,
  threadId: string,
  action: string,
  payload?: Record<string, unknown>,
  signal?: AbortSignal,
  scope?: AgentScopePayload,
): Promise<AgentChatResponse> {
  return api.fetchJson<AgentChatResponse>(
    `${api.config.baseUrl}${AGENT_THREADS_ENDPOINT}/${threadId}/ui-actions`,
    {
      body: JSON.stringify({ action, payload, ...(scope ?? {}) }),
      method: 'POST',
      signal,
    },
    'Failed to respond to UI action',
  );
}

export async function pinThread(
  api: AgentBaseApiService,
  threadId: string,
  signal?: AbortSignal,
): Promise<AgentThread> {
  return updateThread(api, threadId, { isPinned: true }, signal);
}

export async function unpinThread(
  api: AgentBaseApiService,
  threadId: string,
  signal?: AbortSignal,
): Promise<AgentThread> {
  return updateThread(api, threadId, { isPinned: false }, signal);
}

export async function getMessages(
  api: AgentBaseApiService,
  threadId: string,
  params?: GetMessagesParams,
  signal?: AbortSignal,
): Promise<AgentChatMessage[]> {
  const messages = await api.fetchCollection<AgentChatMessage>(
    buildMessagesUrl(api, threadId, params),
    { signal },
    'Failed to fetch messages',
    'Failed to deserialize thread messages',
  );
  const transfers = await getTransfers(api, threadId, signal);

  return hydrateTransferCards(messages, transfers, threadId);
}

export async function getMessagesPage(
  api: AgentBaseApiService,
  threadId: string,
  params?: GetMessagesParams,
  signal?: AbortSignal,
): Promise<AgentMessagesPage> {
  const page = await api.fetchCollectionPage<AgentChatMessage>(
    buildMessagesUrl(api, threadId, params),
    { signal },
    'Failed to fetch messages',
    'Failed to deserialize thread messages',
  );
  const transfers = await getTransfers(api, threadId, signal);

  return {
    hasMore: page.hasMore,
    messages: hydrateTransferCards(page.docs, transfers, threadId),
    nextCursor: page.nextCursor,
  };
}
