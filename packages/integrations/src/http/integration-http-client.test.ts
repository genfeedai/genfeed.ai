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
});
