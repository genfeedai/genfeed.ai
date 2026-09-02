import type { AgentMemoryEntry } from '@genfeedai/agent/models/agent-chat.model';
import type { CredentialMentionItem } from '@genfeedai/agent/services/agent-api.types';
import { AgentApiDecodeError } from '@genfeedai/agent/services/agent-api-error';
import type { AgentBaseApiService } from '@genfeedai/agent/services/agent-base-api.service';
import type {
  AgentCharacterMentionsResponse,
  AgentContentMentionsResponse,
  AgentTeamMentionsResponse,
  AgentCharacterMentionItem as CharacterMentionItem,
  AgentContentMentionItem as ContentMentionItem,
  AgentTeamMentionItem as TeamMentionItem,
} from '@genfeedai/contracts/interfaces';

// fetchJson trusts whatever JSON a 2xx carries, so a proxy or error
// envelope answering 200 without a `mentions` array must become a decode
// failure here — returning `undefined` crashes composer consumers.
function decodeMentions<T>(
  json: { mentions?: unknown } | null | undefined,
  message: string,
): T[] {
  const mentions = json?.mentions;
  if (!Array.isArray(mentions)) {
    throw new AgentApiDecodeError({ cause: json, message });
  }
  return mentions as T[];
}

export async function getMentions(
  api: AgentBaseApiService,
  signal?: AbortSignal,
): Promise<CredentialMentionItem[]> {
  const json = await api.fetchJson<{ mentions: CredentialMentionItem[] }>(
    `${api.config.baseUrl}/credentials/mentions`,
    { signal },
    'Failed to fetch mentions',
  );

  return decodeMentions<CredentialMentionItem>(
    json,
    'Failed to decode credential mentions',
  );
}

export async function getTeamMentions(
  api: AgentBaseApiService,
  signal?: AbortSignal,
): Promise<TeamMentionItem[]> {
  const json = await api.fetchJson<AgentTeamMentionsResponse>(
    `${api.config.baseUrl}/team/mentions`,
    { signal },
    'Failed to fetch team mentions',
  );

  return decodeMentions<TeamMentionItem>(
    json,
    'Failed to decode team mentions',
  );
}

export async function getCharacterMentions(
  api: AgentBaseApiService,
  signal?: AbortSignal,
): Promise<CharacterMentionItem[]> {
  const json = await api.fetchJson<AgentCharacterMentionsResponse>(
    `${api.config.baseUrl}/personas/mentions`,
    { signal },
    'Failed to fetch character mentions',
  );

  return decodeMentions<CharacterMentionItem>(
    json,
    'Failed to decode character mentions',
  );
}

export async function getContentMentions(
  api: AgentBaseApiService,
  signal?: AbortSignal,
): Promise<ContentMentionItem[]> {
  const json = await api.fetchJson<AgentContentMentionsResponse>(
    `${api.config.baseUrl}/content/mentions`,
    { signal },
    'Failed to fetch content mentions',
  );

  return decodeMentions<ContentMentionItem>(
    json,
    'Failed to decode content mentions',
  );
}

export async function listMemories(
  api: AgentBaseApiService,
  signal?: AbortSignal,
): Promise<AgentMemoryEntry[]> {
  return api.fetchJson<AgentMemoryEntry[]>(
    `${api.config.baseUrl}/agent/memories`,
    { signal },
    'Failed to list memories',
  );
}

export async function createMemory(
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
): Promise<AgentMemoryEntry> {
  return api.fetchJson<AgentMemoryEntry>(
    `${api.config.baseUrl}/agent/memories`,
    { body: JSON.stringify(payload), method: 'POST', signal },
    'Failed to create memory',
  );
}

export async function deleteMemory(
  api: AgentBaseApiService,
  memoryId: string,
  signal?: AbortSignal,
): Promise<{ status: string }> {
  return api.fetchJson<{ status: string }>(
    `${api.config.baseUrl}/agent/memories/${memoryId}`,
    { method: 'DELETE', signal },
    'Failed to delete memory',
  );
}
