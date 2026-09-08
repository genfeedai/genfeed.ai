import type { AgentBaseApiService } from '@genfeedai/agent/services/agent-base-api.service';
import type {
  AgentWorkObjectActionPayload,
  AgentWorkObjectCollection,
} from '@genfeedai/contracts/interfaces';

export async function getWorkObjects(
  api: AgentBaseApiService,
  threadId: string,
  sessionId: string,
  signal?: AbortSignal,
): Promise<AgentWorkObjectCollection> {
  const query = new URLSearchParams({ sessionId });
  return api.fetchJson<AgentWorkObjectCollection>(
    `${api.config.baseUrl}/agent/threads/${encodeURIComponent(threadId)}/work-objects?${query}`,
    { headers: await api.headers(), signal },
    'Could not load the work for this conversation.',
  );
}

export async function actOnWorkObject(
  api: AgentBaseApiService,
  threadId: string,
  objectId: string,
  payload: AgentWorkObjectActionPayload,
  signal?: AbortSignal,
): Promise<AgentWorkObjectCollection> {
  return api.fetchJson<AgentWorkObjectCollection>(
    `${api.config.baseUrl}/agent/threads/${encodeURIComponent(threadId)}/work-objects/${encodeURIComponent(objectId)}/actions`,
    {
      body: JSON.stringify(payload),
      headers: await api.headers(),
      method: 'POST',
      signal,
    },
    'Could not update this work object.',
  );
}
