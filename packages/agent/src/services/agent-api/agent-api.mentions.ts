import type { AgentMemoryEntry } from '@genfeedai/agent/models/agent-chat.model';
import type { CredentialMentionItem } from '@genfeedai/agent/services/agent-api.types';
import type { AgentApiError } from '@genfeedai/agent/services/agent-api-error';
import type { AgentBaseApiService } from '@genfeedai/agent/services/agent-base-api.service';
import type {
  AgentContentMentionsResponse,
  AgentTeamMentionsResponse,
  AgentContentMentionItem as ContentMentionItem,
  AgentTeamMentionItem as TeamMentionItem,
} from '@genfeedai/interfaces';
import { Effect } from 'effect';

export function getMentionsEffect(
  api: AgentBaseApiService,
  signal?: AbortSignal,
): Effect.Effect<CredentialMentionItem[], AgentApiError> {
  return api
    .fetchJsonEffect<{ mentions: CredentialMentionItem[] }>(
      `${api.config.baseUrl}/credentials/mentions`,
      { signal },
      'Failed to fetch mentions',
    )
    .pipe(Effect.map((json) => json.mentions));
}

export function getTeamMentionsEffect(
  api: AgentBaseApiService,
  signal?: AbortSignal,
): Effect.Effect<TeamMentionItem[], AgentApiError> {
  return api
    .fetchJsonEffect<AgentTeamMentionsResponse>(
      `${api.config.baseUrl}/team/mentions`,
      { signal },
      'Failed to fetch team mentions',
    )
    .pipe(Effect.map((json) => json.mentions));
}

export function getContentMentionsEffect(
  api: AgentBaseApiService,
  signal?: AbortSignal,
): Effect.Effect<ContentMentionItem[], AgentApiError> {
  return api
    .fetchJsonEffect<AgentContentMentionsResponse>(
      `${api.config.baseUrl}/content/mentions`,
      { signal },
      'Failed to fetch content mentions',
    )
    .pipe(Effect.map((json) => json.mentions));
}

export function listMemoriesEffect(
  api: AgentBaseApiService,
  signal?: AbortSignal,
): Effect.Effect<AgentMemoryEntry[], AgentApiError> {
  return api.fetchJsonEffect<AgentMemoryEntry[]>(
    `${api.config.baseUrl}/agent/memories`,
    { signal },
    'Failed to list memories',
  );
}

export function createMemoryEffect(
  api: AgentBaseApiService,
  payload: {
    content: string;
    summary?: string;
    tags?: string[];
    sourceMessageId?: string;
    kind?: string;
    scope?: string;
    contentType?: string;
    brandId?: string;
    platform?: string;
    sourceType?: string;
    sourceUrl?: string;
    sourceContentId?: string;
    importance?: number;
    confidence?: number;
    performanceSnapshot?: Record<string, unknown>;
    saveToContextMemory?: boolean;
  },
  signal?: AbortSignal,
): Effect.Effect<AgentMemoryEntry, AgentApiError> {
  return api.fetchJsonEffect<AgentMemoryEntry>(
    `${api.config.baseUrl}/agent/memories`,
    { body: JSON.stringify(payload), method: 'POST', signal },
    'Failed to create memory',
  );
}

export function deleteMemoryEffect(
  api: AgentBaseApiService,
  memoryId: string,
  signal?: AbortSignal,
): Effect.Effect<{ status: string }, AgentApiError> {
  return api.fetchJsonEffect<{ status: string }>(
    `${api.config.baseUrl}/agent/memories/${memoryId}`,
    { method: 'DELETE', signal },
    'Failed to delete memory',
  );
}
