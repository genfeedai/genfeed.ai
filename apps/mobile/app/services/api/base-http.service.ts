import Constants from 'expo-constants';

export const API_URL =
  Constants.expoConfig?.extra?.apiUrl || 'https://api.genfeed.ai';

export interface PaginationMeta {
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: Record<string, unknown>;
  params?: Record<string, string | number | boolean | undefined>;
}

export class ApiRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
  }
}

export function apiRoot(): string {
  return `${API_URL.replace(/\/$/, '').replace(/\/v1$/, '')}/v1`;
}

function buildUrl(endpoint: string, params?: RequestOptions['params']): string {
  const url = `${apiRoot()}/${endpoint.replace(/^\//, '')}`;
  if (!params) {
    return url;
  }

  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      searchParams.append(key, String(value));
    }
  });

  const queryString = searchParams.toString();
  return queryString ? `${url}?${queryString}` : url;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readErrorDetail(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null;
  }

  if (typeof payload.message === 'string' && payload.message.trim() !== '') {
    return payload.message;
  }

  if (typeof payload.error === 'string' && payload.error.trim() !== '') {
    return payload.error;
  }

  const errors = payload.errors;
  if (!Array.isArray(errors)) {
    return null;
  }

  const first = errors[0];
  if (!isRecord(first)) {
    return null;
  }

  if (typeof first.detail === 'string' && first.detail.trim() !== '') {
    return first.detail;
  }

  if (typeof first.title === 'string' && first.title.trim() !== '') {
    return first.title;
  }

  return null;
}

function messageForStatus(
  status: number,
  statusText: string,
  payload: unknown,
): string {
  if (status === 401) {
    return 'Sign in again to continue.';
  }

  if (status === 403) {
    return 'You do not have access to this organization or brand.';
  }

  if (status === 404) {
    return 'That record was not found.';
  }

  const detail = readErrorDetail(payload);
  if (detail) {
    return detail;
  }

  const statusLabel = statusText.trim();
  return statusLabel
    ? `Request failed (${status} ${statusLabel}).`
    : `Request failed (${status}).`;
}

export async function apiRequest<T>(
  token: string,
  endpoint: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', body, params } = options;
  const url = buildUrl(endpoint, params);
  const response = await fetch(url, {
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    method,
  });

  if (!response.ok) {
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    throw new ApiRequestError(
      response.status,
      messageForStatus(response.status, response.statusText, payload),
    );
  }

  if (method === 'DELETE' && response.status === 204) {
    return undefined as T;
  }

  return response.json();
}
