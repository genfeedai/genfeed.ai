import type {
  ExecutionHeaderProvider,
  WorkflowUIHttpClient,
} from '../../provider/types';

// =============================================================================
// Module-level execution HTTP configuration
// =============================================================================

/**
 * Injected HTTP client + provider-header supplier for the execution store.
 *
 * The execution store (`executeWorkflow`, `stopExecution`, …) lives outside the
 * React tree (plain Zustand) and cannot read the WorkflowUIProvider context
 * directly, so both are registered at module scope via
 * {@link configureExecutionHttpClient} / {@link configureExecutionHeaders} —
 * the same pattern {@link configureWorkflowLogger} uses.
 *
 * Both default to the package's standalone behavior (bare `fetch`, no BYOK
 * headers) so the package stays usable on its own; the consuming app injects a
 * credentialed client and its provider auth headers through `WorkflowUIConfig`.
 */

export function resolveExecutionApiBaseUrl(value?: string): string {
  const trimmed = value?.trim().replace(/\/+$/, '');
  return trimmed || '/v1';
}

const DEFAULT_API_BASE_URL = resolveExecutionApiBaseUrl(
  process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_ENDPOINT,
);

/**
 * Default fetch-based client. Preserves the package's prior inline `apiPost`
 * behavior exactly: POST to `NEXT_PUBLIC_API_URL`, JSON body, surface the API's
 * error message on non-2xx.
 */
const DEFAULT_HTTP_CLIENT: WorkflowUIHttpClient = {
  post: async <T>(
    path: string,
    body?: Record<string, unknown>,
    options?: { headers?: Record<string, string> },
  ): Promise<T> => {
    const response = await fetch(`${getExecutionApiBaseUrl()}${path}`, {
      headers: { 'Content-Type': 'application/json', ...options?.headers },
      method: 'POST',
      ...(body && { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        (errorData as { message?: string }).message ||
          `API error: ${response.status}`,
      );
    }
    return response.json() as Promise<T>;
  },
};

const NOOP_HEADERS: ExecutionHeaderProvider = () => ({});

let _httpClient: WorkflowUIHttpClient = DEFAULT_HTTP_CLIENT;
let _headers: ExecutionHeaderProvider = NOOP_HEADERS;
let _apiBaseUrl = DEFAULT_API_BASE_URL;

/** Configure the base URL used by execution REST and SSE requests. */
export function configureExecutionApiBaseUrl(value?: string): void {
  _apiBaseUrl = value
    ? resolveExecutionApiBaseUrl(value)
    : DEFAULT_API_BASE_URL;
}

export function getExecutionApiBaseUrl(): string {
  return _apiBaseUrl;
}

/**
 * Register the HTTP client the execution store posts through.
 * Called by WorkflowUIProvider; resets to the bare-fetch default when unset.
 */
export function configureExecutionHttpClient(
  client: WorkflowUIHttpClient | undefined,
): void {
  _httpClient = client ?? DEFAULT_HTTP_CLIENT;
}

/** Read the currently-configured HTTP client (bare fetch until configured). */
export function getExecutionHttpClient(): WorkflowUIHttpClient {
  return _httpClient;
}

/**
 * Register the provider-auth-header supplier for execute requests.
 * Called by WorkflowUIProvider; resets to "no headers" when unset.
 */
export function configureExecutionHeaders(
  provider: ExecutionHeaderProvider | undefined,
): void {
  _headers = provider ?? NOOP_HEADERS;
}

/** Resolve the provider auth headers for the current request (empty until configured). */
export function getExecutionHeaders(): Record<string, string> {
  return _headers();
}
