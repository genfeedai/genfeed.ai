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
  const upstream = await fetch(url, { cache: 'no-store' });
  if (!upstream.ok || !upstream.body) {
    throw new BadGatewayException('The download is unavailable');
  }

  const fileStream = Readable.fromWeb(
    upstream.body as unknown as import('stream/web').ReadableStream,
  );
  res.set({
    'Cache-Control': 'no-store',
    'Content-Disposition': `attachment; filename="${sanitizeAttachmentFilename(filename)}"`,
    'Content-Type':
      upstream.headers.get('content-type') ?? 'application/octet-stream',
  });
  return new StreamableFile(fileStream);
}
