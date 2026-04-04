import { ofetch } from 'ofetch';
import { getApiKey, getApiUrl } from '@/config/store.js';
import { ApiError, AuthError } from '@/utils/errors.js';

export interface ApiResponse<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiErrorResponse {
  error: string;
  message: string;
  statusCode: number;
}

async function createClient() {
  const baseURL = await getApiUrl();
  const apiKey = await getApiKey();

  return ofetch.create({
    baseURL,
    headers: {
      'Content-Type': 'application/json',
    },
    async onRequest({ options }) {
      if (apiKey) {
        options.headers = new Headers(options.headers as unknown as Record<string, string>);
        options.headers.set('Authorization', `Bearer ${apiKey}`);
      }
    },
    async onResponseError({ response }) {
      const body = response._data as ApiErrorResponse | undefined;

      if (response.status === 401) {
        throw new AuthError(body?.message ?? 'Invalid or expired API key');
      }

      if (response.status === 403) {
        throw new ApiError(
          body?.message ?? 'Access denied',
          response.status,
          'Check your API key has the required scopes'
        );
      }

      throw new ApiError(
        body?.message ?? `Request failed with status ${response.status}`,
        response.status
      );
    },
  });
}

export async function get<T>(path: string): Promise<T> {
  const client = await createClient();
  return client<T>(path, { method: 'GET' });
}

export async function post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  const client = await createClient();
  return client<T>(path, { body, method: 'POST' });
}

export async function patch<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  const client = await createClient();
  return client<T>(path, { body, method: 'PATCH' });
}

export async function del<T>(path: string): Promise<T> {
  const client = await createClient();
  return client<T>(path, { method: 'DELETE' });
}

export async function requireAuth(): Promise<string> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new AuthError();
  }
  return apiKey;
}
