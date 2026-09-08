import { AgentApiDecodeError } from '@genfeedai/agent/services/agent-api-error';
import type { AgentBaseApiService } from '@genfeedai/agent/services/agent-base-api.service';
import type {
  AgentWorkObjectActionPayload,
  AgentWorkObjectCollection,
} from '@genfeedai/contracts/interfaces';

function decodeCollection(
  json: AgentWorkObjectCollection | null | undefined,
): AgentWorkObjectCollection {
  if (
    !Array.isArray(json?.workObjects) ||
    !Array.isArray(json?.sessionAssets)
  ) {
    throw new AgentApiDecodeError({
      cause: json,
      message: 'Invalid conversation work response.',
    });
  }
  return json;
}

export async function getWorkObjects(
  api: AgentBaseApiService,
  threadId: string,
  sessionId: string,
  signal?: AbortSignal,
): Promise<AgentWorkObjectCollection> {
  const query = new URLSearchParams({ sessionId });
  const result = await api.fetchJson<AgentWorkObjectCollection>(
    `${api.config.baseUrl}/agent/threads/${encodeURIComponent(threadId)}/work-objects?${query}`,
    { headers: await api.headers(), signal },
    'Could not load the work for this conversation.',
  );
  return decodeCollection(result);
}

export async function actOnWorkObject(
  api: AgentBaseApiService,
  threadId: string,
  objectId: string,
  payload: AgentWorkObjectActionPayload,
  signal?: AbortSignal,
): Promise<AgentWorkObjectCollection> {
  const result = await api.fetchJson<AgentWorkObjectCollection>(
    `${api.config.baseUrl}/agent/threads/${encodeURIComponent(threadId)}/work-objects/${encodeURIComponent(objectId)}/actions`,
    {
      body: JSON.stringify(payload),
      headers: await api.headers(),
      method: 'POST',
      signal,
    },
    'Could not update this work object.',
  );
  return decodeCollection(result);
}
