import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type CreateApiKeyInput,
  createApiKey,
  listApiKeys,
  revokeApiKey,
  rotateApiKey,
} from '../../src/api/api-keys';

const { mockDel, mockGet, mockPost } = vi.hoisted(() => ({
  mockDel: vi.fn(),
  mockGet: vi.fn(),
  mockPost: vi.fn(),
}));

vi.mock('../../src/api/client', () => ({
  del: (path: string) => mockDel(path),
  get: (path: string) => mockGet(path),
  post: (path: string, body?: Record<string, unknown>) => mockPost(path, body),
}));

vi.mock('../../src/api/json-api', () => ({
  extractPagination: (response: { links?: { pagination?: unknown } }) => response.links?.pagination,
  flattenCollection: <T>(response: { data: T[] }) => response.data,
  flattenSingle: <T>(response: { data: T }) => response.data,
}));

describe('api/api-keys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists active API keys', async () => {
    mockGet.mockResolvedValue({
      data: [{ id: 'key-1', label: 'MCP' }],
    });

    const result = await listApiKeys();

    expect(mockGet).toHaveBeenCalledWith('/api-keys?limit=100&page=1');
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(result).toEqual([{ id: 'key-1', label: 'MCP' }]);
  });

  it('paginates through every page until exhausted', async () => {
    mockGet
      .mockResolvedValueOnce({
        data: [{ id: 'key-1', label: 'One' }],
        links: { pagination: { limit: 100, page: 1, pages: 3, total: 201 } },
      })
      .mockResolvedValueOnce({
        data: [{ id: 'key-2', label: 'Two' }],
        links: { pagination: { limit: 100, page: 2, pages: 3, total: 201 } },
      })
      .mockResolvedValueOnce({
        data: [{ id: 'key-3', label: 'Three' }],
        links: { pagination: { limit: 100, page: 3, pages: 3, total: 201 } },
      });

    const result = await listApiKeys();

    expect(mockGet).toHaveBeenNthCalledWith(1, '/api-keys?limit=100&page=1');
    expect(mockGet).toHaveBeenNthCalledWith(2, '/api-keys?limit=100&page=2');
    expect(mockGet).toHaveBeenNthCalledWith(3, '/api-keys?limit=100&page=3');
    expect(mockGet).toHaveBeenCalledTimes(3);
    expect(result).toEqual([
      { id: 'key-1', label: 'One' },
      { id: 'key-2', label: 'Two' },
      { id: 'key-3', label: 'Three' },
    ]);
  });

  it('stops after the last page when more keys remain than one page', async () => {
    mockGet
      .mockResolvedValueOnce({
        data: [{ id: 'key-1' }],
        links: { pagination: { limit: 100, page: 1, pages: 2, total: 101 } },
      })
      .mockResolvedValueOnce({
        data: [{ id: 'key-2' }],
        links: { pagination: { limit: 100, page: 2, pages: 2, total: 101 } },
      });

    await listApiKeys();

    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(mockGet).toHaveBeenLastCalledWith('/api-keys?limit=100&page=2');
  });

  it('creates Genfeed API keys', async () => {
    mockPost.mockResolvedValue({
      data: { id: 'key-1', key: 'gf_test_123', label: 'MCP' },
    });

    const result = await createApiKey({
      label: 'MCP',
      scopes: ['videos:read'],
    });

    expect(mockPost).toHaveBeenCalledWith('/api-keys', {
      category: 'genfeedai',
      label: 'MCP',
      scopes: ['videos:read'],
    });
    expect(result.key).toBe('gf_test_123');
  });

  it('prevents callers from overriding the Genfeed API key category', async () => {
    mockPost.mockResolvedValue({
      data: { id: 'key-1', key: 'gf_test_123', label: 'MCP' },
    });

    await createApiKey({
      category: 'heygen',
      label: 'MCP',
      scopes: ['videos:read'],
    } as unknown as CreateApiKeyInput);

    expect(mockPost).toHaveBeenCalledWith('/api-keys', {
      category: 'genfeedai',
      label: 'MCP',
      scopes: ['videos:read'],
    });
  });

  it('revokes API keys', async () => {
    mockDel.mockResolvedValue({ data: { id: 'key-1', isRevoked: true } });

    await revokeApiKey('key-1');

    expect(mockDel).toHaveBeenCalledWith('/api-keys/key-1');
  });

  it('rotates API keys', async () => {
    mockPost.mockResolvedValue({
      data: { id: 'key-2', key: 'gf_test_rotated' },
    });

    const result = await rotateApiKey('key-1');

    expect(mockPost).toHaveBeenCalledWith('/api-keys/key-1/rotate', undefined);
    expect(result.key).toBe('gf_test_rotated');
  });
});
