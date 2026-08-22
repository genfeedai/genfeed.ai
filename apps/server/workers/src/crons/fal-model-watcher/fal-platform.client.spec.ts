import { LoggerService } from '@libs/logger/logger.service';
import { ConfigService } from '@workers/config/config.service';
import { FalPlatformClient } from '@workers/crons/fal-model-watcher/fal-platform.client';

function response(
  body: Record<string, unknown>,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), { headers, status });
}

function harness() {
  const fetcher = vi.fn();
  const sleep = vi.fn().mockResolvedValue(undefined);
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;
  const config = {
    get: vi.fn((key: string) =>
      key === 'FAL_API_KEY' ? 'commercial-secret' : undefined,
    ),
  } as unknown as ConfigService;

  return {
    fetcher,
    logger,
    sleep,
    client: new FalPlatformClient(logger, config, fetcher, sleep),
  };
}

describe('FalPlatformClient', () => {
  it('paginates OpenAPI-expanded model search with authenticated requests', async () => {
    const { client, fetcher } = harness();
    fetcher
      .mockResolvedValueOnce(
        response({
          has_more: true,
          models: [
            { endpoint_id: 'fal-ai/one', openapi: { openapi: '3.0.4' } },
          ],
          next_cursor: 'page-2',
        }),
      )
      .mockResolvedValueOnce(
        response({
          has_more: false,
          models: [
            { endpoint_id: 'fal-ai/two', openapi: { openapi: '3.0.4' } },
          ],
          next_cursor: null,
        }),
      );

    await expect(client.fetchModels()).resolves.toHaveLength(2);
    const firstUrl = new URL(fetcher.mock.calls[0]?.[0] as string);
    const secondUrl = new URL(fetcher.mock.calls[1]?.[0] as string);
    expect(firstUrl.searchParams.get('expand')).toBe('openapi-3.0');
    expect(secondUrl.searchParams.get('cursor')).toBe('page-2');
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      headers: { Authorization: 'Key commercial-secret' },
    });
  });

  it('chunks pricing endpoint identities, follows cursors, and deduplicates results', async () => {
    const { client, fetcher } = harness();
    const endpoints = Array.from(
      { length: 51 },
      (_, index) => `fal-ai/${index}`,
    );
    fetcher
      .mockResolvedValueOnce(
        response({
          has_more: true,
          next_cursor: 'next',
          prices: [
            {
              currency: 'USD',
              endpoint_id: 'fal-ai/0',
              unit: 'image',
              unit_price: 0.01,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        response({
          has_more: false,
          next_cursor: null,
          prices: [
            {
              currency: 'USD',
              endpoint_id: 'fal-ai/0',
              unit: 'image',
              unit_price: 0.01,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        response({
          has_more: false,
          next_cursor: null,
          prices: [
            {
              currency: 'USD',
              endpoint_id: 'fal-ai/50',
              unit: 'second',
              unit_price: 0.02,
            },
          ],
        }),
      );

    await expect(client.fetchPricing(endpoints)).resolves.toHaveLength(2);
    const urls = fetcher.mock.calls.map((call) => new URL(call[0] as string));
    expect(urls[0]?.searchParams.getAll('endpoint_id')).toHaveLength(50);
    expect(urls[1]?.searchParams.get('cursor')).toBe('next');
    expect(urls[2]?.searchParams.getAll('endpoint_id')).toEqual(['fal-ai/50']);
  });

  it('honors Retry-After on 429 with bounded retries and redacted logs', async () => {
    const { client, fetcher, logger, sleep } = harness();
    fetcher
      .mockResolvedValueOnce(
        response({ error: { type: 'rate_limited' } }, 429, {
          'Retry-After': '2',
        }),
      )
      .mockResolvedValueOnce(
        response({ has_more: false, models: [], next_cursor: null }),
      );

    await client.fetchModels();

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2_000);
    expect(JSON.stringify(vi.mocked(logger).warn.mock.calls)).not.toContain(
      'commercial-secret',
    );
  });

  it('stops after the retry bound', async () => {
    const { client, fetcher } = harness();
    fetcher.mockResolvedValue(
      response({ error: { type: 'server_error' } }, 503),
    );

    await expect(client.fetchModels()).rejects.toThrow(
      'Fal platform request failed after 3 attempts (503)',
    );
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
