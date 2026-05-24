import { vi } from 'vitest';

type JsonApiAttributes = Record<string, unknown>;

export const mockFetch = vi.fn();
global.fetch = mockFetch;

export function mockOk(data: unknown): void {
  mockFetch.mockResolvedValueOnce({
    json: () => Promise.resolve(data),
    ok: true,
  });
}

export function mockJsonApiResource(
  attributes: JsonApiAttributes,
  type = 'strategy',
): void {
  mockOk({
    data: {
      attributes,
      id: String(attributes.id ?? '1'),
      type,
    },
  });
}

export function mockJsonApiCollection(
  items: JsonApiAttributes[],
  type = 'strategy',
): void {
  mockOk({
    data: items.map((item) => ({
      attributes: item,
      id: String(item.id ?? '1'),
      type,
    })),
  });
}

export function mockError(
  status: number,
  payload?: JsonApiAttributes | { errors: Array<JsonApiAttributes> },
): void {
  mockFetch.mockResolvedValueOnce({
    json: () => Promise.resolve(payload),
    ok: false,
    status,
  });
}
