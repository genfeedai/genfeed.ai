import { getIntegrationProviderDefinition } from '../catalog';
import {
  getIntegrationRetryDelayMs,
  IntegrationHttpClient,
  type IntegrationHttpError,
  isRetryableIntegrationStatus,
  parseIntegrationRetryAfterMs,
} from './index';

describe('integration HTTP client', () => {
  it('retries retryable provider statuses and returns JSON', async () => {
    const provider = getIntegrationProviderDefinition('meta_ads');
    const sleep = vi.fn(async () => undefined);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'rate limit' }), {
          headers: { 'retry-after': '1' },
          status: 429,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );

    const client = new IntegrationHttpClient({ fetch: fetchImpl, sleep });
    const result = await client.request<{ ok: boolean }>({
      provider,
      query: { access_token: 'secret-token' },
      url: 'https://graph.facebook.com/v24.0/me',
    });

    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1000);
  });

  it('redacts secret query values from failed request metadata', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
      }),
    );
    const client = new IntegrationHttpClient({ fetch: fetchImpl });

    await expect(
      client.request({
        query: { access_token: 'secret-token' },
        url: 'https://example.com/resource',
      }),
    ).rejects.toMatchObject({
      metadata: {
        status: 401,
        url: 'https://example.com/resource?access_token=%5BREDACTED%5D',
      },
    } satisfies Partial<IntegrationHttpError>);
  });

  it('parses retry policy helpers', () => {
    expect(isRetryableIntegrationStatus(429)).toBe(true);
    expect(isRetryableIntegrationStatus(404)).toBe(false);
    expect(parseIntegrationRetryAfterMs('2')).toBe(2000);
    expect(
      getIntegrationRetryDelayMs({
        attempt: 2,
        config: {
          baseDelayMs: 250,
          maxAttempts: 3,
          retryAfterHeaders: [],
          retryableStatusCodes: [500],
        },
      }),
    ).toBe(500);
  });

  it('resolves to undefined for a 204 No Content response without throwing', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 204 }));
    const client = new IntegrationHttpClient({ fetch: fetchImpl });

    await expect(
      client.request({ url: 'https://example.com/revoke' }),
    ).resolves.toBeUndefined();
  });

  it('resolves to undefined for an empty body advertised via Content-Length: 0', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(null, { headers: { 'content-length': '0' }, status: 200 }),
      );
    const client = new IntegrationHttpClient({ fetch: fetchImpl });

    await expect(
      client.request({ url: 'https://example.com/ok' }),
    ).resolves.toBeUndefined();
  });

  it('treats x-rate-limit-reset as an absolute Unix epoch, not relative seconds', () => {
    const now = new Date(1_717_000_000_000);
    // 10 seconds in the future, expressed as a Unix epoch in seconds.
    expect(
      parseIntegrationRetryAfterMs('1717000010', now, 'x-rate-limit-reset'),
    ).toBe(10_000);
    // Retry-After stays relative seconds.
    expect(parseIntegrationRetryAfterMs('30', now, 'retry-after')).toBe(30_000);
  });

  it('routes x-rate-limit-reset through the epoch path in getIntegrationRetryDelayMs', () => {
    const resetEpochSeconds = Math.floor(Date.now() / 1000) + 5;
    const delay = getIntegrationRetryDelayMs({
      attempt: 1,
      config: {
        baseDelayMs: 250,
        maxAttempts: 3,
        retryAfterHeaders: ['x-rate-limit-reset'],
        retryableStatusCodes: [429],
      },
      headers: new Headers({ 'x-rate-limit-reset': String(resetEpochSeconds) }),
    });

    // ~5 s, not tens of years. Allow a generous window for clock drift.
    expect(delay).toBeGreaterThanOrEqual(3000);
    expect(delay).toBeLessThanOrEqual(6000);
  });

  it('retries network errors, then succeeds', async () => {
    const sleep = vi.fn(async () => undefined);
    const logger = { warn: vi.fn() };
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('socket hang up'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    const client = new IntegrationHttpClient({
      fetch: fetchImpl,
      logger,
      sleep,
    });

    await expect(
      client.request({
        query: { access_token: 'secret-token' },
        retry: { baseDelayMs: 100, maxAttempts: 2 },
        url: 'https://example.com/flaky',
      }),
    ).resolves.toEqual({ ok: true });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(100);
    expect(logger.warn).toHaveBeenCalledWith(
      'Retrying integration request after network error',
      expect.objectContaining({
        attempt: 1,
        url: 'https://example.com/flaky?access_token=%5BREDACTED%5D',
      }),
    );
  });

  it('rethrows the network error once attempts are exhausted', async () => {
    const sleep = vi.fn(async () => undefined);
    const networkError = new TypeError('connection reset');
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(networkError);
    const client = new IntegrationHttpClient({ fetch: fetchImpl, sleep });

    await expect(
      client.request({
        retry: { maxAttempts: 2 },
        url: 'https://example.com/down',
      }),
    ).rejects.toBe(networkError);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('does not retry an IntegrationHttpError thrown for a non-retryable status', async () => {
    const sleep = vi.fn(async () => undefined);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{}', { status: 400 }));
    const client = new IntegrationHttpClient({ fetch: fetchImpl, sleep });

    await expect(
      client.request({
        retry: { maxAttempts: 3 },
        url: 'https://example.com/bad',
      }),
    ).rejects.toMatchObject({
      metadata: { method: 'GET', status: 400 },
      name: 'IntegrationHttpError',
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('aborts the request signal once timeoutMs elapses', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn<typeof fetch>().mockImplementation(
        (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('aborted', 'AbortError'));
            });
          }),
      );
      const client = new IntegrationHttpClient({ fetch: fetchImpl });

      const pending = client.request({
        retry: { maxAttempts: 1 },
        timeoutMs: 50,
        url: 'https://example.com/slow',
      });
      const assertion = expect(pending).rejects.toMatchObject({
        name: 'AbortError',
      });

      await vi.advanceTimersByTimeAsync(50);
      await assertion;
      expect(fetchImpl.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('waits with the default sleep between retries when none is injected', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(new Response('{}', { status: 503 }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ ok: true }), { status: 200 }),
        );
      const client = new IntegrationHttpClient({ fetch: fetchImpl });

      const pending = client.request<{ ok: boolean }>({
        retry: {
          baseDelayMs: 200,
          maxAttempts: 2,
          retryableStatusCodes: [503],
        },
        url: 'https://example.com/unavailable',
      });

      await vi.advanceTimersByTimeAsync(0);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(200);
      await expect(pending).resolves.toEqual({ ok: true });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('serialises plain-object bodies as JSON and lets callers override content-type', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Response('{}', { status: 200 }));
    const client = new IntegrationHttpClient({ fetch: fetchImpl });

    await client.request({
      body: { name: 'launch' },
      method: 'POST',
      url: 'https://example.com/campaigns',
    });
    await client.request({
      body: { name: 'launch' },
      headers: { 'content-type': 'application/vnd.api+json' },
      method: 'POST',
      url: 'https://example.com/campaigns',
    });

    const [, first] = fetchImpl.mock.calls[0] ?? [];
    const [, second] = fetchImpl.mock.calls[1] ?? [];
    expect(first?.body).toBe('{"name":"launch"}');
    expect(first?.headers).toEqual({ 'content-type': 'application/json' });
    expect(second?.headers).toEqual({
      'content-type': 'application/vnd.api+json',
    });
  });

  it('passes string, form and binary bodies through untouched', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Response('{}', { status: 200 }));
    const client = new IntegrationHttpClient({ fetch: fetchImpl });
    const form = new URLSearchParams({ grant_type: 'client_credentials' });
    const buffer = new ArrayBuffer(4);

    await client.request({
      body: 'raw-text',
      headers: { 'x-trace': '1' },
      method: 'POST',
      url: 'https://example.com/raw',
    });
    await client.request({
      body: form,
      method: 'POST',
      url: 'https://example.com/token',
    });
    await client.request({
      body: buffer,
      method: 'PUT',
      url: 'https://example.com/upload',
    });

    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({
      body: 'raw-text',
      headers: { 'x-trace': '1' },
    });
    expect(fetchImpl.mock.calls[1]?.[1]).toMatchObject({
      body: form,
      headers: {},
    });
    expect(fetchImpl.mock.calls[2]?.[1]).toMatchObject({
      body: buffer,
      method: 'PUT',
    });
  });
});
