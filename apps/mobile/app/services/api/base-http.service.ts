import Constants from 'expo-constants';

export const API_URL =
  Constants.expoConfig?.extra?.apiUrl || 'https://api.genfeed.ai';

export interface ApiResponse<T> {
  data: T;
  meta?: {
    pagination?: PaginationMeta;
  };
}

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

function buildUrl(endpoint: string, params?: RequestOptions['params']): string {
  const url = `${API_URL}/${endpoint}`;
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
    throw new Error(`Request failed: ${response.statusText}`);
  }

  if (method === 'DELETE' && response.status === 204) {
    return undefined as T;
  }

  return response.json();
}
