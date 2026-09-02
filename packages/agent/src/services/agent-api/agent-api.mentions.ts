import type { AgentMemoryEntry } from '@genfeedai/agent/models/agent-chat.model';
import type { CredentialMentionItem } from '@genfeedai/agent/services/agent-api.types';
import {
  AgentApiDecodeError,
  type AgentApiError,
} from '@genfeedai/agent/services/agent-api-error';
import type { AgentBaseApiService } from '@genfeedai/agent/services/agent-base-api.service';
import type {
  AgentCharacterMentionsResponse,
  AgentContentMentionsResponse,
  AgentTeamMentionsResponse,
  AgentCharacterMentionItem as CharacterMentionItem,
  AgentContentMentionItem as ContentMentionItem,
  AgentTeamMentionItem as TeamMentionItem,
} from '@genfeedai/contracts/interfaces';
import { Effect } from 'effect';

// fetchJsonEffect trusts whatever JSON a 2xx carries, so a proxy or error
// envelope answering 200 without a `mentions` array must become a decode
// failure here — succeeding with `undefined` crashes composer consumers.
function decodeMentionsEffect<T>(
  json: { mentions?: unknown } | null | undefined,
  message: string,
): Effect.Effect<T[], AgentApiDecodeError> {
  const mentions = json?.mentions;
  return Array.isArray(mentions)
    ? Effect.succeed(mentions as T[])
    : Effect.fail(new AgentApiDecodeError({ cause: json, message }));
}

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
    .pipe(
      Effect.flatMap((json) =>
        decodeMentionsEffect<CredentialMentionItem>(
          json,
          'Failed to decode credential mentions',
        ),
      ),
    );
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
    .pipe(
      Effect.flatMap((json) =>
        decodeMentionsEffect<TeamMentionItem>(
          json,
          'Failed to decode team mentions',
        ),
      ),
    );
}

export function getCharacterMentionsEffect(
  api: AgentBaseApiService,
  signal?: AbortSignal,
): Effect.Effect<CharacterMentionItem[], AgentApiError> {
  return api
    .fetchJsonEffect<AgentCharacterMentionsResponse>(
      `${api.config.baseUrl}/personas/mentions`,
      { signal },
      'Failed to fetch character mentions',
    )
    .pipe(
      Effect.flatMap((json) =>
        decodeMentionsEffect<CharacterMentionItem>(
          json,
          'Failed to decode character mentions',
        ),
      ),
    );
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
    .pipe(
      Effect.flatMap((json) =>
        decodeMentionsEffect<ContentMentionItem>(
          json,
          'Failed to decode content mentions',
        ),
      ),
    );
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
