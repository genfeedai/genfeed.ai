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
import { AgentApiRequestError } from '@genfeedai/agent/services/agent-api-error';
import type { AgentBaseApiService } from '@genfeedai/agent/services/agent-base-api.service';
import { AgentThreadStatus } from '@genfeedai/contracts';
import type {
  AgentScopePayload,
  AgentTransferPresentation,
  IAgentTransfer,
} from '@genfeedai/contracts/interfaces';
import { Effect } from 'effect';

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

function getTransfersEffect(
  api: AgentBaseApiService,
  threadId: string,
  signal?: AbortSignal,
): Effect.Effect<IAgentTransfer[], AgentApiError> {
  return api
    .fetchCollectionEffect<IAgentTransfer>(
      `${api.config.baseUrl}/agent/transfers?threadId=${encodeURIComponent(threadId)}`,
      { signal },
      'Failed to fetch conversation transfers',
      'Failed to deserialize conversation transfers',
    )
    .pipe(Effect.catchAll(() => Effect.succeed([])));
}

export function retryAgentTransferEffect(
  api: AgentBaseApiService,
  transferId: string,
  signal?: AbortSignal,
): Effect.Effect<IAgentTransfer, AgentApiError> {
  return api.fetchResourceEffect<IAgentTransfer>(
    `${api.config.baseUrl}/agent/transfers/${encodeURIComponent(transferId)}/retry`,
    { method: 'POST', signal },
    'Failed to retry conversation transfer',
    'Failed to deserialize conversation transfer',
  );
}

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

  return api
    .fetchJsonEffect<AgentChatStreamResponse>(
      `${api.config.baseUrl}${endpoint}`,
      { body: JSON.stringify(body), method: 'POST', signal },
      'Agent chat stream failed',
    )
    .pipe(
      Effect.mapError((error) =>
        error instanceof AgentApiRequestError
          ? new AgentApiRequestError({
              detail: error.detail,
              message: error.message,
              source:
                error.status === 408 || error.status === 504
                  ? 'acknowledgement'
                  : error.source,
              status: error.status,
            })
          : error,
      ),
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
    /**
     * When set, list is narrowed server-side to threads opened from that entry
     * point (`onboarding`, `agent`, `proactive`).
     */
    source?: string | null;
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
  if (params?.source) {
    qs.set('source', params.source);
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
  params?: GetMessagesParams,
  signal?: AbortSignal,
): Effect.Effect<AgentChatMessage[], AgentApiError> {
  return Effect.all({
    messages: api.fetchCollectionEffect<AgentChatMessage>(
      buildMessagesUrl(api, threadId, params),
      { signal },
      'Failed to fetch messages',
      'Failed to deserialize thread messages',
    ),
    transfers: getTransfersEffect(api, threadId, signal),
  }).pipe(
    Effect.map(({ messages, transfers }) =>
      hydrateTransferCards(messages, transfers, threadId),
    ),
  );
}

export function getMessagesPageEffect(
  api: AgentBaseApiService,
  threadId: string,
  params?: GetMessagesParams,
  signal?: AbortSignal,
): Effect.Effect<AgentMessagesPage, AgentApiError> {
  return Effect.all({
    page: api.fetchCollectionPageEffect<AgentChatMessage>(
      buildMessagesUrl(api, threadId, params),
      { signal },
      'Failed to fetch messages',
      'Failed to deserialize thread messages',
    ),
    transfers: getTransfersEffect(api, threadId, signal),
  }).pipe(
    Effect.map(
      ({ page, transfers }): AgentMessagesPage => ({
        hasMore: page.hasMore,
        messages: hydrateTransferCards(page.docs, transfers, threadId),
        nextCursor: page.nextCursor,
      }),
    ),
  );
}
