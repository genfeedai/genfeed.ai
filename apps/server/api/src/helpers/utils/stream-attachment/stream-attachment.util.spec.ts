import { streamRemoteAttachment } from '@api/helpers/utils/stream-attachment/stream-attachment.util';
import { BadGatewayException, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('streamRemoteAttachment', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('streams the remote file as an attachment with the given filename', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        body: new ReadableStream(),
        headers: new Headers({ 'content-type': 'image/png' }),
        ok: true,
      }),
    );
    const res = { set: vi.fn() };

    const result = await streamRemoteAttachment(
      'https://cdn.example/preview.png',
      'image-1-watermarked.png',
      res as unknown as Response,
    );

    expect(result).toBeInstanceOf(StreamableFile);
    expect(res.set).toHaveBeenCalledWith({
      'Access-Control-Expose-Headers': 'Content-Disposition',
      'Cache-Control': 'no-store',
      'Content-Disposition': 'attachment; filename="image-1-watermarked.png"',
      'Content-Type': 'image/png',
    });
  });

  it('fails closed when the remote file cannot be read', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 403 }),
    );

    await expect(
      streamRemoteAttachment('https://cdn.example/preview.png', 'preview.png', {
        set: vi.fn(),
      } as unknown as Response),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });
});
