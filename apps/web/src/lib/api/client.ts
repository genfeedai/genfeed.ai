const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://local.genfeed.ai:4001/api';

interface FetchOptions extends RequestInit {
  signal?: AbortSignal;
}

class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public data?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  const config: RequestInit = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  const response = await fetch(url, config);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status,
      errorData.message || `HTTP error ${response.status}`,
      errorData
    );
  }

  return response.json();
}

/**
 * Upload a file using FormData
 */
async function uploadFile<T>(endpoint: string, file: File, options: FetchOptions = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const formData = new FormData();
  formData.append('file', file);

  const config: RequestInit = {
    body: formData,
    method: 'POST',
    // Don't set Content-Type - browser will set it with boundary for multipart/form-data
    ...options,
  };

  const response = await fetch(url, config);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status,
      errorData.message || `HTTP error ${response.status}`,
      errorData
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
