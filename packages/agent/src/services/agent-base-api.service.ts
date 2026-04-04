import {
  AgentApiAuthError,
  AgentApiDecodeError,
  type AgentApiError,
  AgentApiRequestError,
} from '@genfeedai/agent/services/agent-api-error';
import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@helpers/data/json-api/json-api.helper';
import { Cause, Effect, Exit } from 'effect';

export interface AgentApiConfig {
  baseUrl: string;
  getToken: (options?: { forceRefresh?: boolean }) => Promise<string | null>;
}

export type AgentApiEffectError = AgentApiError | AgentApiAuthError;

export async function runAgentApiEffect<T>(
  effect: Effect.Effect<T, AgentApiEffectError>,
): Promise<T> {
  const exit = await Effect.runPromiseExit(effect);

  if (Exit.isSuccess(exit)) {
    return exit.value;
  }

  throw Cause.squash(exit.cause);
}

export class AgentBaseApiService {
  protected config: AgentApiConfig;

  constructor(config: AgentApiConfig) {
    this.config = config;
  }

  protected headersEffect(options?: {
    forceRefresh?: boolean;
  }): Effect.Effect<Record<string, string>, AgentApiAuthError> {
    return Effect.tryPromise({
      catch: (cause) =>
        new AgentApiAuthError({
          cause,
          message: 'Failed to resolve auth token',
        }),
      try: () => this.config.getToken(options),
    }).pipe(
      Effect.map((token) => {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };

        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }

        return headers;
      }),
    );
  }

  protected fetchJsonEffect<T>(
    url: string,
    init?: RequestInit,
    errorMessage?: string,
  ): Effect.Effect<T, AgentApiError> {
    return this.fetchJsonWithRetryEffect<T>(url, init, errorMessage, false);
  }

  protected fetchResourceEffect<T>(
    url: string,
    init: RequestInit | undefined,
    requestErrorMessage: string,
    decodeErrorMessage: string,
  ): Effect.Effect<T, AgentApiError> {
    return this.fetchJsonEffect<JsonApiResponseDocument>(
      url,
      init,
      requestErrorMessage,
    ).pipe(
      Effect.flatMap((json) =>
        this.deserializeResourceEffect<T>(json, decodeErrorMessage),
      ),
    );
  }

  protected fetchCollectionEffect<T>(
    url: string,
    init: RequestInit | undefined,
    requestErrorMessage: string,
    decodeErrorMessage: string,
  ): Effect.Effect<T[], AgentApiError> {
    return this.fetchJsonEffect<JsonApiResponseDocument>(
      url,
      init,
      requestErrorMessage,
    ).pipe(
      Effect.flatMap((json) =>
        this.deserializeCollectionEffect<T>(json, decodeErrorMessage),
      ),
    );
  }

  protected deserializeResourceEffect<T>(
    document: JsonApiResponseDocument,
    message: string,
  ): Effect.Effect<T, AgentApiDecodeError> {
    return Effect.try({
      catch: (cause) =>
        new AgentApiDecodeError({
          cause,
          message,
        }),
      try: () => deserializeResource<T>(document),
    });
  }

  protected deserializeCollectionEffect<T>(
    document: JsonApiResponseDocument,
    message: string,
  ): Effect.Effect<T[], AgentApiDecodeError> {
    return Effect.try({
      catch: (cause) =>
        new AgentApiDecodeError({
          cause,
          message,
        }),
      try: () => deserializeCollection<T>(document),
    });
  }

  private fetchJsonWithRetryEffect<T>(
    url: string,
    init: RequestInit | undefined,
    errorMessage: string | undefined,
    hasRetriedAuth: boolean,
  ): Effect.Effect<T, AgentApiError> {
    const isFormDataBody =
      typeof FormData !== 'undefined' && init?.body instanceof FormData;

    return Effect.gen(this, function* () {
      const defaultHeaders = yield* this.headersEffect(
        hasRetriedAuth ? { forceRefresh: true } : undefined,
      );

      if (isFormDataBody) {
        delete defaultHeaders['Content-Type'];
      }

      const response = yield* this.performFetchEffect(url, {
        ...init,
        headers: {
          ...defaultHeaders,
          ...(init?.headers as Record<string, string> | undefined),
        },
      });

      if (!response.ok) {
        const message = errorMessage ?? 'Request failed';
        const detail = yield* this.extractErrorDetailEffect(response);

        if (
          !hasRetriedAuth &&
          this.shouldRetryWithFreshToken(response.status, detail)
        ) {
          return yield* this.fetchJsonWithRetryEffect(
            url,
            init,
            errorMessage,
            true,
          );
        }

        return yield* Effect.fail(
          new AgentApiRequestError({
            detail,
            message: detail
              ? `${message}: ${response.status} - ${detail}`
              : `${message}: ${response.status}`,
            status: response.status,
          }),
        );
      }

      return yield* this.decodeJsonEffect<T>(response);
    }) as Effect.Effect<T, AgentApiError>;
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

  private performFetchEffect(
    url: string,
    init: RequestInit,
  ): Effect.Effect<Response, AgentApiRequestError> {
    return Effect.tryPromise({
      catch: (cause) =>
        new AgentApiRequestError({
          detail: cause instanceof Error ? cause.message : undefined,
          message:
            cause instanceof Error ? cause.message : 'Network request failed',
          status: 0,
        }),
      try: () => fetch(url, init),
    });
  }

  private decodeJsonEffect<T>(
    response: Response,
  ): Effect.Effect<T, AgentApiDecodeError> {
    return Effect.tryPromise({
      catch: (cause) =>
        new AgentApiDecodeError({
          cause,
          message: 'Failed to decode JSON response',
        }),
      try: () => response.json() as Promise<T>,
    });
  }

  private extractErrorDetailEffect(
    response: Response,
  ): Effect.Effect<string | undefined> {
    return Effect.tryPromise({
      catch: () => undefined,
      try: () =>
        response.json() as Promise<
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
          | undefined
        >,
    }).pipe(
      Effect.catchAll(() => Effect.succeed(undefined)),
      Effect.map((payload) => {
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
          (typeof payload?.message === 'string'
            ? payload.message
            : undefined) ||
          payload?.error ||
          payload?.title
        );
      }),
    );
  }
}
