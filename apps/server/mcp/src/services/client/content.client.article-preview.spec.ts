import type { LoggerService } from '@libs/logger/logger.service';
import type { ConfigService } from '@mcp/config/config.service';
import { McpUpstreamError } from '@mcp/tools/mcp-tool-error';
import type { HttpService } from '@nestjs/axios';
import type { AxiosInstance } from 'axios';
import { describe, expect, it } from 'vitest';
import { BaseApiClient } from './base-api-client';
import { ContentClient } from './content.client';

function createClient(status: number) {
  const levels: string[] = [];
  const http = {
    get: async () => {
      throw Object.assign(new Error(`Request failed with status ${status}`), {
        response: { data: { errors: [{ detail: 'secret detail' }] }, status },
      });
    },
    interceptors: { request: { use: () => 0 } },
  } as unknown as AxiosInstance;
  const logger = {
    debug: () => levels.push('debug'),
    error: () => levels.push('error'),
    warn: () => levels.push('warn'),
  } as unknown as LoggerService;
  const base = new BaseApiClient(
    logger,
    { axiosRef: { create: () => http } } as unknown as HttpService,
    { get: () => undefined } as unknown as ConfigService,
  );
  return { client: new ContentClient(base), levels };
}

describe('ContentClient.getArticlePreview failures', () => {
  it('keeps the 404 status and logs it as a warning, not an error', async () => {
    const { client, levels } = createClient(404);

    const failure = await client.getArticlePreview('missing').catch((e) => e);

    expect(failure).toBeInstanceOf(McpUpstreamError);
    expect(failure.status).toBe(404);
    expect(failure.message).toBe(
      'Article not found. Check the articleId and brandId.',
    );
    expect(levels).toEqual(['warn']);
  });

  it('keeps the generic message for a server fault and logs it as an error', async () => {
    const { client, levels } = createClient(500);

    const failure = await client.getArticlePreview('article-1').catch((e) => e);

    expect(failure).toBeInstanceOf(McpUpstreamError);
    expect(failure.status).toBe(500);
    expect(failure.message).toBe('Failed to get article preview');
    expect(levels).toEqual(['error']);
  });
});
