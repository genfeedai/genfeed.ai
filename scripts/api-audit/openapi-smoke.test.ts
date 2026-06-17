import { afterEach, describe, expect, it, vi } from 'vitest';
import { runOpenApiSmoke } from './openapi-smoke';

describe('openapi smoke audit', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('honors path-level parameters and counts client failures separately from missing auth', async () => {
    const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);

      if (url.endsWith('/openapi.json')) {
        return new Response(
          JSON.stringify({
            paths: {
              '/brands/{brandId}/posts': {
                get: { operationId: 'listBrandPosts' },
                parameters: [
                  {
                    in: 'path',
                    name: 'brandId',
                    required: true,
                  },
                ],
              },
              '/health': {
                get: { operationId: 'health' },
              },
              '/missing': {
                get: { operationId: 'missing' },
              },
              '/private': {
                get: { operationId: 'private' },
              },
              '/search': {
                get: {
                  operationId: 'search',
                  parameters: [
                    {
                      in: 'query',
                      name: 'q',
                      required: true,
                    },
                  ],
                },
              },
            },
          }),
        );
      }

      if (url.endsWith('/health')) {
        return new Response(null, { status: 204, statusText: 'No Content' });
      }

      if (url.endsWith('/missing')) {
        return new Response(null, { status: 404, statusText: 'Not Found' });
      }

      if (url.endsWith('/private')) {
        return new Response(null, {
          status: 401,
          statusText: 'Unauthorized',
        });
      }

      throw new Error(`Unexpected smoke target: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    const report = await runOpenApiSmoke({
      baseUrl: 'http://api.test/v1',
      concurrency: 1,
      openApiUrl: 'http://api.test/v1/openapi.json',
      timeoutMs: 1_000,
    });

    expect(report.skipped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operationId: 'listBrandPosts',
          skipReason: 'path params',
        }),
        expect.objectContaining({
          operationId: 'search',
          skipReason: 'required query params',
        }),
      ]),
    );
    expect(report.summary).toMatchObject({
      authMissing: 1,
      failed: 1,
      passed: 1,
      skipped: 2,
      targets: 3,
    });
  });
});
