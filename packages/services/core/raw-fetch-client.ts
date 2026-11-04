import { getRequestOrganizationHeaders } from '@services/core/interceptor.service';
import {
  deserializeCollection,
  deserializeResource,
} from '@services/core/json-api';
import { logger } from '@services/core/logger.service';

type RawFetchMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';
type RawFetchDeserializeMode = 'resource' | 'collection' | 'none';

/**
 * A bearer-token `fetch` client for API routes the axios services do not cover. Every request
 * carries the routed organization header so the API can reject organization drift (#5393).
 */
export abstract class RawFetchClient {
  constructor(
    private readonly baseURL: string,
    private readonly token: string,
  ) {}

  protected async request<T>(
    endpoint: string,
    method: RawFetchMethod,
    body?: unknown,
    errorMessage?: string,
    deserialize: RawFetchDeserializeMode = 'none',
  ): Promise<T> {
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      body: body ? JSON.stringify(body) : undefined,
      headers: {
        ...getRequestOrganizationHeaders(),
        Authorization: `Bearer ${this.token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      method,
    });

    if (!response.ok) {
      const error = new Error(errorMessage || `Request failed: ${endpoint}`);
      logger.error(errorMessage || 'Request failed', { endpoint, error });
      throw error;
    }

    const json = await response.json();

    if (deserialize === 'resource') {
      return deserializeResource<T>(json);
    }

    if (deserialize === 'collection') {
      return deserializeCollection(json) as T;
    }

    return json;
  }
}
