import {
  AgentApiAuthError,
  AgentApiDecodeError,
  AgentApiRequestError,
} from '@genfeedai/agent/services/agent-api-error';
import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@helpers/data/json-api/json-api.helper';

export interface AgentApiConfig {
  baseUrl: string;
  getToken: (options?: { forceRefresh?: boolean }) => Promise<string | null>;
}

/**
 * One page of a keyset-paginated collection: the rows plus the cursor state the
 * caller needs to ask for the page before it.
 */
export interface AgentApiCollectionPage<T> {
  docs: T[];
  hasMore: boolean;
  nextCursor: string | null;
}

/**
 * Shared HTTP client for agent API modules. Fetch helpers are public so
 * domain modules (`agent-api/threads`, `runs`, …) can compose without
 * living on a single god class.
 */
export class AgentBaseApiService {
  readonly config: AgentApiConfig;

  constructor(config: AgentApiConfig) {
    this.config = config;
  }

  async headers(options?: {
    forceRefresh?: boolean;
  }): Promise<Record<string, string>> {
    let token: string | null;

    try {
      token = await this.config.getToken(options);
    } catch (cause) {
      throw new AgentApiAuthError({
        cause,
        message: 'Failed to resolve auth token',
      });
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    return headers;
  }

  async fetchJson<T>(
    url: string,
    init?: RequestInit,
    errorMessage?: string,
  ): Promise<T> {
    return this.fetchJsonWithRetry<T>(url, init, errorMessage, false);
  }

  async fetchResource<T>(
    url: string,
    init: RequestInit | undefined,
    requestErrorMessage: string,
    decodeErrorMessage: string,
  ): Promise<T> {
    const json = await this.fetchJson<JsonApiResponseDocument>(
      url,
      init,
      requestErrorMessage,
    );

    return this.deserializeResourceOrThrow<T>(json, decodeErrorMessage);
  }

  async fetchCollection<T>(
    url: string,
    init: RequestInit | undefined,
    requestErrorMessage: string,
    decodeErrorMessage: string,
  ): Promise<T[]> {
    const json = await this.fetchJson<JsonApiResponseDocument>(
      url,
      init,
      requestErrorMessage,
    );

    return this.deserializeCollectionOrThrow<T>(json, decodeErrorMessage);
  }

  /**
   * Like `fetchCollection`, but keeps the keyset-pagination links the
   * plain collection fetch drops. Callers that page need the cursor, and the
   * only place it exists is the top-level JSON:API document.
   */
  async fetchCollectionPage<T>(
    url: string,
    init: RequestInit | undefined,
    requestErrorMessage: string,
    decodeErrorMessage: string,
  ): Promise<AgentApiCollectionPage<T>> {
    const json = await this.fetchJson<JsonApiResponseDocument>(
      url,
      init,
      requestErrorMessage,
    );
    const docs = this.deserializeCollectionOrThrow<T>(json, decodeErrorMessage);

    return {
      docs,
      // A response without cursor links reads as "nothing older", which
      // stops the caller asking rather than looping on a cursor the
      // server never issued.
      hasMore: json.links?.cursor?.hasMore ?? false,
      nextCursor: json.links?.cursor?.nextCursor ?? null,
    };
  }

  private deserializeResourceOrThrow<T>(
    document: JsonApiResponseDocument,
    message: string,
  ): T {
    try {
      return deserializeResource<T>(document);
    } catch (cause) {
      throw new AgentApiDecodeError({ cause, message });
    }
  }

  private deserializeCollectionOrThrow<T>(
    document: JsonApiResponseDocument,
    message: string,
  ): T[] {
    try {
      return deserializeCollection<T>(document);
    } catch (cause) {
      throw new AgentApiDecodeError({ cause, message });
    }
  }

  private async fetchJsonWithRetry<T>(
    url: string,
    init: RequestInit | undefined,
    errorMessage: string | undefined,
    hasRetriedAuth: boolean,
  ): Promise<T> {
    const isFormDataBody =
      typeof FormData !== 'undefined' && init?.body instanceof FormData;

    const defaultHeaders = await this.headers(
      hasRetriedAuth ? { forceRefresh: true } : undefined,
    );

    if (isFormDataBody) {
      delete defaultHeaders['Content-Type'];
    }

    const response = await this.performFetch(url, {
      ...init,
      headers: {
        ...defaultHeaders,
        ...(init?.headers as Record<string, string> | undefined),
      },
    });

    if (!response.ok) {
      const message = errorMessage ?? 'Request failed';
      const detail = await this.extractErrorDetail(response);

      if (
        !hasRetriedAuth &&
        this.shouldRetryWithFreshToken(response.status, detail)
      ) {
        return this.fetchJsonWithRetry(url, init, errorMessage, true);
      }

      throw new AgentApiRequestError({
        detail,
        message: detail
          ? `${message}: ${response.status} - ${detail}`
          : `${message}: ${response.status}`,
        source: 'api',
        status: response.status,
      });
    }

    return this.decodeJson<T>(response);
  }

  private shouldRetryWithFreshToken(status: number, detail?: string): boolean {
    if (status !== 401 || !detail) {
      return false;
    }

    const normalizedDetail = detail.toLowerCase();
    return (
      normalizedDetail.includes('token expired') ||
      normalizedDetail.includes('jwt is expired') ||
      normalizedDetail.includes('session expired')
    );
  }

  private async performFetch(
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    try {
      return await fetch(url, init);
    } catch (cause) {
      throw new AgentApiRequestError({
        detail: cause instanceof Error ? cause.message : undefined,
        message:
          cause instanceof Error ? cause.message : 'Network request failed',
        source: 'network',
        status: 0,
      });
    }
  }

  private async decodeJson<T>(response: Response): Promise<T> {
    try {
      return (await response.json()) as T;
    } catch (cause) {
      throw new AgentApiDecodeError({
        cause,
        message: 'Failed to decode JSON response',
      });
    }
  }

  private async extractErrorDetail(
    response: Response,
  ): Promise<string | undefined> {
    let payload:
      | {
          errors?: Array<{
            detail?: string;
            message?: string;
            title?: string;
          }>;
          detail?: string;
          error?: string;
          message?: string | string[];
          title?: string;
        }
      | undefined;

    try {
      payload = await response.json();
    } catch {
      return undefined;
    }

    const firstJsonApiError = payload?.errors?.[0];
    const fromErrors =
      firstJsonApiError?.detail ||
      firstJsonApiError?.message ||
      firstJsonApiError?.title;

    if (fromErrors) {
      return fromErrors;
    }

    if (Array.isArray(payload?.message)) {
      return payload.message.join(', ');
    }

    return (
      payload?.detail ||
      (typeof payload?.message === 'string' ? payload.message : undefined) ||
      payload?.error ||
      payload?.title
    );
  }
}
