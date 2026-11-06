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

export type FakeResourceRow = Record<string, unknown> & { id: string };

export interface FakeJsonApiResource {
  /** The rows the fake server currently holds. */
  rows: FakeResourceRow[];
}

function toResourceObject(
  row: FakeResourceRow,
  type: string,
): { attributes: Record<string, unknown>; id: string; type: string } {
  const { id, ...attributes } = row;
  return { attributes, id, type };
}

/**
 * Install an in-memory JSON:API resource as a service's axios instance, so a
 * spec asserts what the server ends up holding and what the service returns
 * instead of which HTTP calls it made. Supports the collection routes
 * (`get('')` filtered by `params`, `post('')`) and the member routes
 * (`get('/id')`, `patch('/id')`, `delete('/id')`).
 */
export function installFakeJsonApiResource(
  service: unknown,
  options: { rows?: FakeResourceRow[]; type: string },
): FakeJsonApiResource {
  const resource: FakeJsonApiResource = { rows: [...(options.rows ?? [])] };
  let nextId = resource.rows.length + 1;
  const memberId = (path: string): string => path.replace(/^\//, '');
  const findRow = (path: string): FakeResourceRow => {
    const row = resource.rows.find((item) => item.id === memberId(path));
    if (!row) {
      throw new Error(`404: ${options.type} ${memberId(path)} not found`);
    }
    return row;
  };
  const single = (row: FakeResourceRow) => ({
    data: { data: toResourceObject(row, options.type) },
  });

  (service as { instance: unknown }).instance = {
    delete: async (path: string) => {
      const row = findRow(path);
      resource.rows = resource.rows.filter((item) => item !== row);
      return single(row);
    },
    get: async (
      path: string,
      config: { params?: Record<string, unknown> } = {},
    ) => {
      if (path !== '') {
        return single(findRow(path));
      }
      const filters = Object.entries(config.params ?? {});
      const rows = resource.rows.filter((row) =>
        filters.every(([key, value]) => row[key] === value),
      );
      return {
        data: { data: rows.map((row) => toResourceObject(row, options.type)) },
      };
    },
    patch: async (path: string, body: Record<string, unknown>) => {
      const row = findRow(path);
      Object.assign(row, body);
      return single(row);
    },
    post: async (path: string, body: Record<string, unknown>) => {
      if (path !== '') {
        throw new Error(`Unsupported POST ${path}`);
      }
      const row: FakeResourceRow = {
        ...body,
        id: `${options.type}-${nextId++}`,
      };
      resource.rows.push(row);
      return single(row);
    },
  };
  return resource;
}
