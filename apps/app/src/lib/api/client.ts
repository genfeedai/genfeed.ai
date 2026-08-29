import {
  type AuthTokenGetter,
  resolveAuthToken,
} from '@helpers/auth/auth.helper';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/v1';

interface FetchOptions extends Omit<RequestInit, 'headers'> {
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public data?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Browser session token resolver, bound by `ApiAuthBridge` for as long as the
 * protected shell is mounted.
 *
 * Requests from this module reach the API through the same-origin `/v1`
 * rewrite. Neither `proxy.ts` (which returns `NextResponse.next()` for `/v1`
 * before any auth handling) nor a Next rewrite can attach an `Authorization`
 * header, and `CombinedAuthGuard` has no cookie path: in cloud deployments it
 * accepts a bearer token or nothing. Self-hosted LOCAL and HYBRID modes inject
 * a local identity instead, which is why these calls work there regardless.
 *
 * The token only exists inside React context, so the shell registers a
 * resolver here rather than every call site threading one through a config
 * object owned by `packages/workflows`.
 */
let authTokenGetter: AuthTokenGetter | null = null;

export function registerApiAuthTokenGetter(
  getToken: AuthTokenGetter | null,
): void {
  authTokenGetter = getToken;
}

/**
 * A bearer token must never leave the browser over plaintext. The default base
 * is the same-origin `/v1` rewrite, which inherits the page's scheme, but a
 * deployment can point `NEXT_PUBLIC_API_URL` at an absolute origin. Loopback
 * stays allowed so `http://localhost` development keeps working.
 */
function isSecureApiOrigin(url: string): boolean {
  const base = typeof window === 'undefined' ? undefined : window.location.href;

  let resolved: URL;

  try {
    resolved = new URL(url, base);
  } catch {
    // A relative base with no window (SSR/test) is same-origin by definition.
    return true;
  }

  if (resolved.protocol === 'https:') {
    return true;
  }

  return (
    resolved.hostname === 'localhost' ||
    resolved.hostname === '127.0.0.1' ||
    resolved.hostname === '[::1]' ||
    resolved.hostname === '::1'
  );
}

/**
 * Fetch merges same-named headers instead of replacing them, and header names
 * are case-insensitive. Merge on a lowercase key so a caller passing
 * `content-type` overrides the default rather than appending a second value,
 * while the emitted name keeps the casing of whichever side declared it first.
 */
async function buildHeaders(
  base: Record<string, string>,
  overrides: Record<string, string> | undefined,
  url: string,
): Promise<Record<string, string>> {
  const merged = new Map<string, [string, string]>();

  for (const [name, value] of Object.entries(base)) {
    merged.set(name.toLowerCase(), [name, value]);
  }

  for (const [name, value] of Object.entries(overrides ?? {})) {
    const key = name.toLowerCase();
    merged.set(key, [merged.get(key)?.[0] ?? name, value]);
  }

  if (authTokenGetter && isSecureApiOrigin(url)) {
    const token = await resolveAuthToken(authTokenGetter);

    if (token) {
      merged.set('authorization', ['Authorization', `Bearer ${token}`]);
    }
  }

  return Object.fromEntries(merged.values());
}

async function request<T>(
  endpoint: string,
  options: FetchOptions = {},
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  // Headers are applied after the spread so a caller passing provider headers
  // (BYOK execution keys) extends the defaults instead of replacing them.
  const config: RequestInit = {
    ...options,
    headers: await buildHeaders(
      { 'Content-Type': 'application/json' },
      options.headers,
      url,
    ),
  };

  const response = await fetch(url, config);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status,
      errorData.message || `HTTP error ${response.status}`,
      errorData,
    );
  }

  return response.json();
}

/**
 * Upload a file using FormData
 */
async function uploadFile<T>(
  endpoint: string,
  file: File,
  options: FetchOptions = {},
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const formData = new FormData();
  formData.append('file', file);

  // No Content-Type: the browser sets it with the multipart boundary.
  const config: RequestInit = {
    ...options,
    body: formData,
    headers: await buildHeaders({}, options.headers, url),
    method: 'POST',
  };

  const response = await fetch(url, config);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status,
      errorData.message || `HTTP error ${response.status}`,
      errorData,
    );
  }

  return response.json();
}

export const apiClient = {
  delete: <T>(endpoint: string, options?: FetchOptions) =>
    request<T>(endpoint, { ...options, method: 'DELETE' }),
  get: <T>(endpoint: string, options?: FetchOptions) =>
    request<T>(endpoint, { ...options, method: 'GET' }),

  patch: <T>(endpoint: string, data?: unknown, options?: FetchOptions) =>
    request<T>(endpoint, {
      ...options,
      body: data ? JSON.stringify(data) : undefined,
      method: 'PATCH',
    }),

  post: <T>(endpoint: string, data?: unknown, options?: FetchOptions) =>
    request<T>(endpoint, {
      ...options,
      body: data ? JSON.stringify(data) : undefined,
      method: 'POST',
    }),

  put: <T>(endpoint: string, data?: unknown, options?: FetchOptions) =>
    request<T>(endpoint, {
      ...options,
      body: data ? JSON.stringify(data) : undefined,
      method: 'PUT',
    }),

  /**
   * Upload a file to the server
   * @param endpoint - API endpoint (e.g., '/files/workflows/{workflowId}/input/image')
   * @param file - File to upload
   * @param options - Additional fetch options
   */
  uploadFile: <T>(endpoint: string, file: File, options?: FetchOptions) =>
    uploadFile<T>(endpoint, file, options),
};

export { ApiError };
