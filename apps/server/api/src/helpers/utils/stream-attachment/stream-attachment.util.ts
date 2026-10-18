import { Readable } from 'node:stream';
import { BadGatewayException, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';

export function sanitizeAttachmentFilename(filename: string): string {
  const trimmed = filename.trim() || 'download';
  return trimmed.replace(/["\\\r\n]/g, '_').slice(0, 180);
}

export async function streamRemoteAttachment(
  url: string,
  filename: string,
  res: Response,
): Promise<StreamableFile> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  res.once('close', abort);
  res.once('finish', abort);

  try {
    if (res.destroyed || res.writableEnded) abort();
    controller.signal.throwIfAborted();

    const upstream = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
    });
    if (res.destroyed || res.writableEnded) abort();
    if (controller.signal.aborted || !upstream.ok || !upstream.body) {
      try {
        await upstream.body?.cancel();
      } catch {
        // Keep the original cancellation or gateway failure.
      }
      controller.signal.throwIfAborted();
      throw new BadGatewayException('The download is unavailable');
    }

    const fileStream = Readable.fromWeb(
      upstream.body as unknown as import('stream/web').ReadableStream,
    );
    try {
      res.set({
        'Access-Control-Expose-Headers': 'Content-Disposition',
        'Cache-Control': 'no-store',
        'Content-Disposition': `attachment; filename="${sanitizeAttachmentFilename(filename)}"`,
        'Content-Type':
          upstream.headers.get('content-type') ?? 'application/octet-stream',
      });
      return new StreamableFile(fileStream);
    } catch (error) {
      fileStream.destroy();
      throw error;
    }
  } finally {
    res.off('close', abort);
    res.off('finish', abort);
  }
}
