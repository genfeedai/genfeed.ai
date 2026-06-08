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
});
