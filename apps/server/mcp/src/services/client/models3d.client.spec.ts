import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { BaseApiClient } from '@mcp/services/client/base-api-client';
import { Models3dClient } from '@mcp/services/client/models3d.client';
import { McpUpstreamError } from '@mcp/tools/mcp-tool-error';
import type { HttpService } from '@nestjs/axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('Models3dClient', () => {
  const post = vi.fn();
  const get = vi.fn();
  let client: Models3dClient;

  beforeEach(() => {
    post.mockReset();
    get.mockReset();
    const http = { defaults: { headers: {} }, get, post };
    const base = new BaseApiClient(
      {
        debug: () => undefined,
        error: () => undefined,
      } as unknown as LoggerService,
      { axiosRef: { create: () => http } } as unknown as HttpService,
      { get: () => undefined } as unknown as ConfigService,
    );
    client = new Models3dClient(base);
  });

  it('posts the image and omits unset optional fields', async () => {
    post.mockResolvedValue({ data: { id: 'm-1', status: 'sheet_pending' } });

    const result = await client.render3d({
      imageUrl: 'https://example.com/house.png',
    });

    expect(post).toHaveBeenCalledWith('/models3d', {
      imageUrl: 'https://example.com/house.png',
    });
    expect(result).toEqual({ id: 'm-1', status: 'sheet_pending' });
  });

  it('forwards build and prompt when set', async () => {
    post.mockResolvedValue({ data: { id: 'm-2' } });

    await client.render3d({
      build: true,
      imageUrl: 'https://example.com/house.png',
      prompt: 'a modern house',
    });

    expect(post).toHaveBeenCalledWith('/models3d', {
      build: true,
      imageUrl: 'https://example.com/house.png',
      prompt: 'a modern house',
    });
  });

  it('reads a render by encoded id', async () => {
    get.mockResolvedValue({ data: { id: 'a/b', status: 'ready' } });

    const result = await client.getModel3d({ id: 'a/b' });

    expect(get).toHaveBeenCalledWith('/models3d/a%2Fb');
    expect(result).toEqual({ id: 'a/b', status: 'ready' });
  });

  it('keeps the upstream status and detail when the API refuses', async () => {
    post.mockRejectedValue({
      response: {
        data: { errors: [{ detail: 'Insufficient credits' }] },
        status: 402,
      },
    });

    const failure = await client
      .render3d({ imageUrl: 'https://example.com/house.png' })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(McpUpstreamError);
    expect(failure).toMatchObject({ status: 402 });
    expect((failure as Error).message).toContain('Insufficient credits');
  });
});
