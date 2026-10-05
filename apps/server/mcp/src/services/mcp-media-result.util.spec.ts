import type { LoggerService } from '@libs/logger/logger.service';
import type { ClientService } from '@mcp/services/client.service';
import { toNativeMcpMediaResult } from '@mcp/services/mcp-media-result.util';
import { ToolRegistryService } from '@mcp/services/tool-registry.service';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

const url = 'https://cdn.genfeed.ai/ingredients/images/img-1';
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const payload = { id: 'img-1', kind: 'image', status: 'GENERATED', url };
const origins = ['https://cdn.genfeed.ai'];

function mockFetch(response: Response) {
  const fetcher = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

afterEach(() => vi.unstubAllGlobals());

describe('native MCP image delivery', () => {
  it('returns extensionless JPEG bytes with correct MIME through get_job_status and card wrapping', async () => {
    const fetcher = mockFetch(
      new Response(jpeg, {
        headers: { 'content-type': 'image/jpeg', 'content-length': '7' },
      }),
    );
    const client = {
      executeAgentTool: vi
        .fn()
        .mockResolvedValue({ success: true, data: payload }),
    };
    const logger = { debug: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const registry = new ToolRegistryService(
      client as unknown as ClientService,
      logger as unknown as LoggerService,
    );
    const result = await registry.handleToolCall({
      name: 'get_job_status',
      arguments: { jobId: 'img-1' },
    });
    const parsed = CallToolResultSchema.parse(result);
    expect(parsed.content).toContainEqual({
      type: 'image',
      data: Buffer.from(jpeg).toString('base64'),
      mimeType: 'image/jpeg',
    });
    expect(parsed.structuredContent?.artifact).toMatchObject({
      mimeType: 'image/jpeg',
      renderMode: 'native_image',
      sizeBytes: 7,
    });
    expect(fetcher).toHaveBeenCalledWith(
      url,
      expect.objectContaining({
        redirect: 'error',
        credentials: 'omit',
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it.each([
    'https://evil.example/image.png',
    'http://cdn.genfeed.ai/image.png',
    'https://cdn.genfeed.ai.evil.example/image.png',
    'https://fixture@cdn.genfeed.ai/image.png',
    'https://cdn.genfeed.ai:8443/image.png',
  ])('never fetches untrusted URL %s', async (untrusted) => {
    const fetcher = mockFetch(new Response(jpeg));
    const result = await toNativeMcpMediaResult(
      { ...payload, url: untrusted },
      origins,
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.structuredContent.artifact?.renderMode).toBe('resource_link');
  });

  it.each(['PROCESSING', 'FAILED'])(
    'does not fetch %s images',
    async (status) => {
      const fetcher = mockFetch(new Response(jpeg));
      await toNativeMcpMediaResult({ ...payload, status }, origins);
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it.each(['video', 'audio'])(
    'preserves %s file delivery without fetching',
    async (kind) => {
      const fetcher = mockFetch(new Response(jpeg));
      const result = await toNativeMcpMediaResult(
        { ...payload, kind },
        origins,
      );
      expect(fetcher).not.toHaveBeenCalled();
      expect(result.structuredContent.artifact?.renderMode).toBe(
        'file_download',
      );
      expect(result.content.some((part) => part.type === 'image')).toBe(false);
    },
  );

  it.each([
    () =>
      new Response('<html>bad gateway</html>', {
        headers: { 'content-type': 'image/jpeg' },
      }),
    () => new Response(jpeg, { status: 500 }),
    () =>
      new Response(jpeg, {
        status: 302,
        headers: { location: 'http://127.0.0.1' },
      }),
    () => new Response(jpeg, { headers: { 'content-type': 'image/png' } }),
    () =>
      new Response(jpeg, {
        headers: { 'content-type': 'image/jpeg', 'content-length': '4000000' },
      }),
    () =>
      new Response(new Uint8Array(3 * 1024 * 1024 + 1), {
        headers: { 'content-type': 'image/jpeg' },
      }),
  ])(
    'falls back honestly for invalid, failed, redirected or oversized media',
    async (response) => {
      mockFetch(response());
      const result = await toNativeMcpMediaResult(payload, origins);
      expect(result.content.some((part) => part.type === 'image')).toBe(false);
      expect(result.structuredContent.artifact?.renderMode).toBe(
        'resource_link',
      );
      expect(result.content).toContainEqual(
        expect.objectContaining({
          type: 'text',
          text: expect.stringContaining('preview unavailable'),
        }),
      );
    },
  );

  it('falls back when fetching times out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new DOMException('timed out', 'TimeoutError')),
    );
    const result = await toNativeMcpMediaResult(payload, origins);
    expect(result.structuredContent.artifact?.renderMode).toBe('resource_link');
  });
});
