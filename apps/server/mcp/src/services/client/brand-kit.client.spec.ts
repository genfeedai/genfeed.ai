import type { LoggerService } from '@libs/logger/logger.service';
import type { ConfigService } from '@mcp/config/config.service';
import { McpUpstreamError } from '@mcp/tools/mcp-tool-error';
import type { HttpService } from '@nestjs/axios';
import type { AxiosInstance } from 'axios';
import { describe, expect, it } from 'vitest';
import { BaseApiClient } from './base-api-client';
import {
  BRAND_KIT_EDIT_REFUSED_MESSAGE,
  BrandKitClient,
} from './brand-kit.client';

function createClient(status: number, detail: string) {
  const http = {
    interceptors: { request: { use: () => 0 } },
    patch: async () => {
      throw Object.assign(new Error(`Request failed with status ${status}`), {
        response: { data: { errors: [{ detail }] }, status },
      });
    },
  } as unknown as AxiosInstance;
  const logger = {
    debug: () => 0,
    error: () => 0,
    warn: () => 0,
  } as unknown as LoggerService;
  const base = new BaseApiClient(
    logger,
    { axiosRef: { create: () => http } } as unknown as HttpService,
    { get: () => undefined } as unknown as ConfigService,
  );
  return new BrandKitClient(base);
}

describe('BrandKitClient.updateSection refusals', () => {
  it.each([401, 403])(
    'names the missing scope and how to get it when the API answers %s',
    async (status) => {
      const client = createClient(status, 'Insufficient permissions');

      const failure = await client
        .updateSection('brand-1', 'writing_voice', { tone: 'warm' })
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(McpUpstreamError);
      expect((failure as McpUpstreamError).status).toBe(status);
      expect((failure as McpUpstreamError).message).toBe(
        BRAND_KIT_EDIT_REFUSED_MESSAGE,
      );
      expect(BRAND_KIT_EDIT_REFUSED_MESSAGE).toContain('brand-kit:write');
    },
  );

  it('keeps the API detail for a field the API rejects', async () => {
    const client = createClient(400, 'tone must be a string');

    const failure = await client
      .updateSection('brand-1', 'writing_voice', { tone: 3 })
      .catch((error: unknown) => error);

    expect((failure as McpUpstreamError).message).toBe('tone must be a string');
  });
});
