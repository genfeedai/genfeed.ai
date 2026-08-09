/**
 * Shared HTTP test doubles for @genfeedai/services unit tests.
 *
 * Services in this package are thin wrappers around an axios instance
 * (`this.instance`) or global `fetch`. These helpers build a fully mocked
 * axios-like client, install it on a service, and construct JSON:API
 * documents that the real json-api deserializer accepts.
 */
import type { JsonApiResponseDocument } from '@services/core/json-api';
import { vi } from 'vitest';

export interface MockHttpInstance {
  delete: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
}

export function createMockHttp(): MockHttpInstance {
  return {
    delete: vi.fn(),
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  };
}

/**
 * Replace a service's protected axios instance with a mock client.
 * Returns the mock for call assertions.
 */
export function installMockHttp(service: unknown): MockHttpInstance {
  const mock = createMockHttp();
  (service as { instance: MockHttpInstance }).instance = mock;
  return mock;
}

/** Wrap a payload in the `{ data }` axios response envelope. */
export function axiosResponse<T>(data: T): { data: T } {
  return { data };
}

/**
 * Build a JSON:API single-resource document.
 *
 * NOTE: when the consuming service runs the document through
 * `extractResource`/`extractCollection`, include at least one non-`id`
 * attribute — the relationship normalizer collapses id-only objects into
 * bare id strings.
 */
export function resourceDocument(
  attributes: Record<string, unknown>,
  options: { id?: string; type?: string } = {},
): JsonApiResponseDocument {
  return {
    data: {
      attributes,
      id: options.id ?? 'id-1',
      type: options.type ?? 'resources',
    },
  };
}

/** Build a JSON:API collection document with optional pagination links. */
export function collectionDocument(
  items: Array<Record<string, unknown>>,
  options: {
    type?: string;
    pagination?: { limit: number; page: number; pages: number; total: number };
  } = {},
): JsonApiResponseDocument {
  return {
    data: items.map((attributes, index) => ({
      attributes,
      id: String(attributes.id ?? `id-${index + 1}`),
      type: options.type ?? 'resources',
    })),
    ...(options.pagination
      ? { links: { pagination: options.pagination } }
      : {}),
  };
}

export interface MockFetchResponseInit {
  ok?: boolean;
  status?: number;
}

/** Build a minimal fetch Response-like object resolving to `payload`. */
export function fetchResponse<T>(
  payload: T,
  init: MockFetchResponseInit = {},
): { ok: boolean; status: number; json: () => Promise<T> } {
  return {
    json: () => Promise.resolve(payload),
    ok: init.ok ?? true,
    status: init.status ?? (init.ok === false ? 500 : 200),
  };
}

/** Install a fetch mock as the global fetch and return it for assertions. */
export function installMockFetch(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
