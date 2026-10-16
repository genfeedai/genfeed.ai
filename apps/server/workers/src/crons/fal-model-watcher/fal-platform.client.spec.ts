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
    client: new FalPlatformClient(logger, config, { fetcher, sleep }),
  };
}

describe('FalPlatformClient', () => {
  it('requests OpenAPI-expanded metadata for exact endpoints, ten at a time', async () => {
    const { client, fetcher } = harness();
    const endpoints = Array.from(
      { length: 11 },
      (_, index) => `fal-ai/${index}`,
    );
    fetcher
      .mockResolvedValueOnce(
        response({
          has_more: true,
          models: [{ endpoint_id: 'fal-ai/0', openapi: { openapi: '3.0.4' } }],
          next_cursor: 'page-2',
        }),
      )
      .mockResolvedValueOnce(
        response({
          has_more: false,
          models: [{ endpoint_id: 'fal-ai/1', openapi: { openapi: '3.0.4' } }],
          next_cursor: null,
        }),
      )
      .mockResolvedValueOnce(
        response({
          has_more: false,
          models: [{ endpoint_id: 'fal-ai/10', openapi: { openapi: '3.0.4' } }],
          next_cursor: null,
        }),
      );

    await expect(client.fetchModels(endpoints)).resolves.toHaveLength(3);
    const urls = fetcher.mock.calls.map((call) => new URL(call[0] as string));
    expect(urls[0]?.searchParams.get('expand')).toBe('openapi-3.0');
    // Fal rejects a larger limit when OpenAPI expansion is requested.
    expect(urls[0]?.searchParams.get('limit')).toBe('10');
    expect(urls[0]?.searchParams.getAll('endpoint_id')).toHaveLength(10);
    expect(urls[0]?.searchParams.has('status')).toBe(false);
    expect(urls[1]?.searchParams.get('cursor')).toBe('page-2');
    expect(urls[2]?.searchParams.getAll('endpoint_id')).toEqual(['fal-ai/10']);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      headers: { Authorization: 'Key commercial-secret' },
    });
  });

  it('isolates an endpoint fal cannot address instead of failing the batch', async () => {
    const { client, fetcher, sleep } = harness();
    fetcher.mockImplementation(async (input: string) => {
      const ids = new URL(input).searchParams.getAll('endpoint_id');
      if (ids.includes('minimax/h3-max/director'))
        return response(
          { error: { message: 'Endpoint(s) not found', type: 'not_found' } },
          404,
        );
      return response({
        has_more: false,
        models: ids.map((endpoint_id) => ({ endpoint_id })),
        next_cursor: null,
      });
    });

    await expect(
      client.fetchModels([
        'minimax/h3-max/text-to-video',
        'minimax/h3-max/director',
        'fal-ai/lyria3/pro',
      ]),
    ).resolves.toEqual([
      { endpoint_id: 'minimax/h3-max/text-to-video' },
      { endpoint_id: 'fal-ai/lyria3/pro' },
    ]);
    // One batch, then one request per endpoint; a 404 is never retried.
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('finds an active endpoint by search when it is not addressable by id', async () => {
    const { client, fetcher } = harness();
    fetcher.mockImplementation(async () =>
      response({
        has_more: false,
        models: [
          {
            endpoint_id: 'minimax/h3-max/director',
            metadata: { status: 'active' },
          },
          { endpoint_id: 'minimax/h3-max/director/v2' },
        ],
        next_cursor: null,
      }),
    );

    await expect(
      client.isListedActive('minimax/h3-max/director'),
    ).resolves.toBe(true);
    await expect(client.isListedActive('minimax/h3-max')).resolves.toBe(false);
    expect(
      new URL(fetcher.mock.calls[0]?.[0] as string).searchParams.get('q'),
    ).toBe('minimax/h3-max/director');
  });

  it('isolates an unaddressable endpoint in a pricing batch', async () => {
    const { client, fetcher } = harness();
    fetcher.mockImplementation(async (input: string) => {
      const ids = new URL(input).searchParams.getAll('endpoint_id');
      if (ids.includes('minimax/h3-max/director'))
        return response({ error: { type: 'not_found' } }, 404);
      return response({
        has_more: false,
        next_cursor: null,
        prices: ids.map((endpoint_id) => ({ endpoint_id, unit_price: 0.03 })),
      });
    });

    await expect(
      client.fetchPricing([
        'minimax/h3-max/director',
        'minimax/h3-max/text-to-video',
      ]),
    ).resolves.toEqual([
      { endpoint_id: 'minimax/h3-max/text-to-video', unit_price: 0.03 },
    ]);
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

    await client.fetchModels(['fal-ai/one']);

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2_000);
    expect(JSON.stringify(vi.mocked(logger).warn.mock.calls)).not.toContain(
      'commercial-secret',
    );
  });

  it('clamps provider retry hints to the bounded synchronization delay', async () => {
    const { client, fetcher, sleep } = harness();
    fetcher
      .mockResolvedValueOnce(
        response({ error: { type: 'rate_limited' } }, 429, {
          'Retry-After': '3600',
        }),
      )
      .mockResolvedValueOnce(
        response({ has_more: false, models: [], next_cursor: null }),
      );

    await client.fetchModels(['fal-ai/one']);

    expect(sleep).toHaveBeenCalledWith(30_000);
  });

  it('stops after the retry bound', async () => {
    const { client, fetcher } = harness();
    fetcher.mockResolvedValue(
      response({ error: { type: 'server_error' } }, 503),
    );

    await expect(client.fetchModels(['fal-ai/one'])).rejects.toThrow(
      'Fal platform request failed after 3 attempts (503)',
    );
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
