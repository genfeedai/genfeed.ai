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

async function buildHeaders(
  base: Record<string, string>,
  overrides: Record<string, string> | undefined,
): Promise<Record<string, string>> {
  const headers: Record<string, string> = { ...base, ...overrides };

  if (authTokenGetter) {
    const token = await resolveAuthToken(authTokenGetter);

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  return headers;
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
    headers: await buildHeaders({}, options.headers),
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
