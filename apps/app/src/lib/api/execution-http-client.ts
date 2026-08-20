import {
  deserializeResource,
  type JsonApiResponseDocument,
} from '@helpers/data/json-api/json-api.helper';
import { apiClient } from '@/lib/api/client';

function isJsonApiResourceDocument(
  payload: unknown,
): payload is JsonApiResponseDocument {
  if (!payload || typeof payload !== 'object' || !('data' in payload)) {
    return false;
  }

  const data = (payload as { data?: unknown }).data;
  return Boolean(data && typeof data === 'object' && 'type' in data);
}

/**
 * Canvas Run posts through the workflows UI package, which reads `execution.id`
 * from the raw POST body. The API returns JSON:API, so unwrap it here.
 */
export async function postWorkflowExecution<T>(
  path: string,
  body?: Record<string, unknown>,
  options?: { headers?: Record<string, string> },
): Promise<T> {
  const response = await apiClient.post<unknown>(path, body, options);
  if (isJsonApiResourceDocument(response)) {
    return deserializeResource<T>(response);
  }
  return response as T;
}
