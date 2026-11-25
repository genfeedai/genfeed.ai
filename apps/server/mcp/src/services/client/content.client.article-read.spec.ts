import type { LoggerService } from '@libs/logger/logger.service';
import type { ConfigService } from '@mcp/config/config.service';
import { McpUpstreamError } from '@mcp/tools/mcp-tool-error';
import type { HttpService } from '@nestjs/axios';
import type { AxiosInstance } from 'axios';
import { describe, expect, it } from 'vitest';
import { BaseApiClient } from './base-api-client';
import { ContentClient } from './content.client';

function createClient(outcome: { status: number } | { article: unknown }) {
  const logged: Array<{ level: string; data: unknown }> = [];
  const http = {
    get: async () => {
      if ('article' in outcome) return { data: { data: outcome.article } };
      throw Object.assign(
        new Error(`Request failed with status ${outcome.status}`),
        {
          response: {
            data: { errors: [{ detail: 'secret article text' }] },
            status: outcome.status,
          },
        },
      );
    },
    interceptors: { request: { use: () => 0 } },
  } as unknown as AxiosInstance;
  const record =
    (level: string) => (_message: string, _error?: unknown, meta?: unknown) =>
      logged.push({ data: meta, level });
  const logger = {
    debug: () => 0,
    error: record('error'),
    warn: record('warn'),
  } as unknown as LoggerService;
  const base = new BaseApiClient(
    logger,
    { axiosRef: { create: () => http } } as unknown as HttpService,
    { get: () => undefined } as unknown as ConfigService,
  );
  return { client: new ContentClient(base), logged };
}

describe('ContentClient.getArticle', () => {
  it('returns the article an authorized read finds', async () => {
    const { client } = createClient({
      article: {
        attributes: {
          content: 'one two three',
          label: 'Title',
          status: 'draft',
        },
        id: 'article-1',
      },
    });

    await expect(client.getArticle('article-1')).resolves.toMatchObject({
      id: 'article-1',
      status: 'draft',
      title: 'Title',
      wordCount: 3,
    });
  });

  it.each([
    [400, 'Article read was rejected. Check the articleId and brandId.'],
    [
      403,
      'You do not have access to this article. Check the brandId and your connection.',
    ],
    [404, 'Article not found. Check the articleId and brandId.'],
    [500, 'Failed to get article'],
  ])('fails a %s read with one stable message', async (status, message) => {
    const { client } = createClient({ status });

    const failure = await client.getArticle('article-1').catch((e) => e);

    expect(failure).toBeInstanceOf(McpUpstreamError);
    expect(failure.status).toBe(status);
    expect(failure.message).toBe(message);
  });

  it('logs the downstream failure by status only, never the upstream body', async () => {
    const { client, logged } = createClient({ status: 500 });

    await client.getArticle('article-1').catch(() => undefined);

    expect(logged).toHaveLength(1);
    expect(logged[0]?.level).toBe('error');
    expect(JSON.stringify(logged[0]?.data)).not.toContain(
      'secret article text',
    );
  });
});
