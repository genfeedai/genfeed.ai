import type {
  IntegrationProviderDefinition,
  IntegrationProviderRetryConfig,
} from '../catalog';
import {
  DEFAULT_INTEGRATION_RETRY_CONFIG,
  getIntegrationRetryDelayMs,
  isRetryableIntegrationStatus,
} from './retry-policy';

export type IntegrationHttpMethod = 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';

export interface IntegrationHttpClientLogger {
  debug?(message: string, metadata?: Record<string, unknown>): void;
  warn?(message: string, metadata?: Record<string, unknown>): void;
}

export interface IntegrationHttpClientOptions {
  fetch?: typeof fetch;
  logger?: IntegrationHttpClientLogger;
  sleep?: (ms: number) => Promise<void>;
}

export interface IntegrationHttpRequestOptions {
  body?: BodyInit | Record<string, unknown>;
  headers?: Record<string, string>;
  method?: IntegrationHttpMethod;
  provider?: IntegrationProviderDefinition;
  query?: Record<string, string | number | boolean | undefined>;
  retry?: Partial<IntegrationProviderRetryConfig>;
  timeoutMs?: number;
  url: string;
}

export interface IntegrationHttpErrorMetadata {
  method: IntegrationHttpMethod;
  providerKey?: string;
  status?: number;
  url: string;
}

export class IntegrationHttpError extends Error {
  readonly metadata: IntegrationHttpErrorMetadata;

  constructor(message: string, metadata: IntegrationHttpErrorMetadata) {
    super(message);
    this.name = 'IntegrationHttpError';
    this.metadata = metadata;
  }
}

const SECRET_QUERY_KEYS = new Set([
  'access_token',
  'api_key',
  'apikey',
  'authorization',
  'client_secret',
  'key',
  'refresh_token',
  'token',
]);

function mergeRetryConfig(
  provider?: IntegrationProviderDefinition,
  override?: Partial<IntegrationProviderRetryConfig>,
): IntegrationProviderRetryConfig {
  return {
    ...(provider?.retry ?? DEFAULT_INTEGRATION_RETRY_CONFIG),
    ...override,
  };
}

function buildUrl(input: IntegrationHttpRequestOptions): string {
  const url = new URL(input.url);

  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

function redactUrl(url: string): string {
  const parsed = new URL(url);

  for (const key of [...parsed.searchParams.keys()]) {
    if (SECRET_QUERY_KEYS.has(key.toLowerCase())) {
      parsed.searchParams.set(key, '[REDACTED]');
    }
  }

  return parsed.toString();
}

function buildRequestBody(
  body: BodyInit | Record<string, unknown> | undefined,
): BodyInit | undefined {
  if (!body || body instanceof FormData || body instanceof URLSearchParams) {
    return body;
  }

  if (typeof body === 'string' || body instanceof ArrayBuffer) {
    return body;
  }

  return JSON.stringify(body);
}

function buildHeaders(
  headers: Record<string, string> | undefined,
  body: BodyInit | Record<string, unknown> | undefined,
): Record<string, string> {
  if (
    !body ||
    body instanceof FormData ||
    body instanceof URLSearchParams ||
    typeof body === 'string' ||
    body instanceof ArrayBuffer
  ) {
    return headers ?? {};
  }

  return {
    'content-type': 'application/json',
    ...(headers ?? {}),
  };
}

async function defaultSleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export class IntegrationHttpClient {
  private readonly fetchImpl: typeof fetch;
  private readonly logger?: IntegrationHttpClientLogger;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: IntegrationHttpClientOptions = {}) {
    this.fetchImpl = options.fetch ?? fetch;
    this.logger = options.logger;
    this.sleep = options.sleep ?? defaultSleep;
  }

  async request<T>(options: IntegrationHttpRequestOptions): Promise<T> {
    const method = options.method ?? 'GET';
    const url = buildUrl(options);
    const redactedUrl = redactUrl(url);
    const retry = mergeRetryConfig(options.provider, options.retry);

    for (let attempt = 1; attempt <= retry.maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout =
        options.timeoutMs !== undefined
          ? setTimeout(() => controller.abort(), options.timeoutMs)
          : undefined;

      try {
        const response = await this.fetchImpl(url, {
          body: buildRequestBody(options.body),
          headers: buildHeaders(options.headers, options.body),
          method,
          signal: controller.signal,
        });

        if (response.ok) {
          return (await response.json()) as T;
        }

        if (
          attempt < retry.maxAttempts &&
          isRetryableIntegrationStatus(response.status, retry)
        ) {
          const delayMs = getIntegrationRetryDelayMs({
            attempt,
            config: retry,
            headers: response.headers,
          });
          this.logger?.warn?.('Retrying integration request', {
            attempt,
            providerKey: options.provider?.key,
            status: response.status,
            url: redactedUrl,
          });
          await this.sleep(delayMs);
          continue;
        }

        throw new IntegrationHttpError('Integration request failed', {
          method,
          providerKey: options.provider?.key,
          status: response.status,
          url: redactedUrl,
        });
      } catch (error: unknown) {
        if (error instanceof IntegrationHttpError) {
          throw error;
        }

        if (attempt < retry.maxAttempts) {
          const delayMs = getIntegrationRetryDelayMs({
            attempt,
            config: retry,
          });
          this.logger?.warn?.(
            'Retrying integration request after network error',
            {
              attempt,
              providerKey: options.provider?.key,
              url: redactedUrl,
            },
          );
          await this.sleep(delayMs);
        }
      } finally {
        if (timeout) {
          clearTimeout(timeout);
        }
      }
    }

    throw new IntegrationHttpError('Integration request failed', {
      method,
      providerKey: options.provider?.key,
      url: redactedUrl,
    });
  }
}
