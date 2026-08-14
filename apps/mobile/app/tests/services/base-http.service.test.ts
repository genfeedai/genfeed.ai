import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from '@/services/api/base-http.service';

describe('apiRequest', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('sends a bearer token and serializes query params, skipping undefined', async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({ data: { id: '1' } }),
      ok: true,
      status: 200,
    });

    const result = await apiRequest<{ data: { id: string } }>(
      'token-1',
      'ingredients',
      {
        params: { category: 'image', page: 2, unused: undefined },
      },
    );

    expect(result).toEqual({ data: { id: '1' } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/ingredients?');
    expect(url).toContain('category=image');
    expect(url).toContain('page=2');
    expect(url).not.toContain('unused');
    expect(init.method).toBe('GET');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer token-1',
      'Content-Type': 'application/json',
    });
  });

  it('JSON-encodes a body for write methods', async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({ ok: true }),
      ok: true,
      status: 200,
    });

    await apiRequest('token-1', 'ideas', {
      body: { title: 'Ship it' },
      method: 'POST',
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ title: 'Ship it' }));
  });

  it('returns undefined for a 204 DELETE and throws on a failed response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 204,
    });

    await expect(
      apiRequest('token-1', 'ingredients/1', { method: 'DELETE' }),
    ).resolves.toBeUndefined();

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    await expect(apiRequest('token-1', 'ingredients')).rejects.toThrow(
      'Request failed: Internal Server Error',
    );
  });
});
