import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearFetchCache, deduplicatedFetch } from './deduplicatedFetch';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  });
}

describe('deduplicatedFetch', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    clearFetchCache();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    clearFetchCache();
    vi.unstubAllGlobals();
  });

  it('performs a real fetch on first call', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));

    const response = await deduplicatedFetch('https://api.test/data');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it('shares one network request across concurrent callers', async () => {
    let resolveFetch: ((r: Response) => void) | undefined;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const first = deduplicatedFetch('https://api.test/data');
    const second = deduplicatedFetch('https://api.test/data');
    resolveFetch?.(jsonResponse({ shared: 1 }));

    const [a, b] = await Promise.all([first, second]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(a.json()).resolves.toEqual({ shared: 1 });
    await expect(b.json()).resolves.toEqual({ shared: 1 });
  });

  it('serves from cache within the TTL', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ cached: true }, 201));

    await deduplicatedFetch('https://api.test/data');
    const response = await deduplicatedFetch('https://api.test/data');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ cached: true });
  });

  it('treats different headers as different cache keys', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

    await deduplicatedFetch('https://api.test/data', {
      headers: { 'X-Key': 'a' },
    });
    await deduplicatedFetch('https://api.test/data', {
      headers: { 'X-Key': 'b' },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('normalizes Headers instances and tuple arrays to the same key', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

    await deduplicatedFetch('https://api.test/data', {
      headers: new Headers({ 'x-key': 'a' }),
    });
    await deduplicatedFetch('https://api.test/data', {
      headers: [['x-key', 'a']],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('clearFetchCache forces a refetch', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

    await deduplicatedFetch('https://api.test/data');
    clearFetchCache();
    await deduplicatedFetch('https://api.test/data');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('expires cache entries after the TTL', async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

      await deduplicatedFetch('https://api.test/data');
      vi.advanceTimersByTime(6000);
      await deduplicatedFetch('https://api.test/data');

      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
