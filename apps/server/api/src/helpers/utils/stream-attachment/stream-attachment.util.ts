import { Readable } from 'node:stream';
import {
  ClientClosedRequestException,
  type ClientClosedRequestStage,
} from '@api/helpers/exceptions/client-closed-request/client-closed-request.exception';
import { BadGatewayException, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';

export function sanitizeAttachmentFilename(filename: string): string {
  const trimmed = filename.trim() || 'download';
  return trimmed.replace(/["\\\r\n]/g, '_').slice(0, 180);
}

function isAbortFailure(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' || error.name === 'TimeoutError')
  );
}

/**
 * Streams a remote file to the client as a download. If the client closes the
 * connection first it throws `ClientClosedRequestException` (a 499 that is not
 * reported) and cancels the upstream fetch. An upstream that aborts or times
 * out on its own surfaces as a 502; any other failure is rethrown unchanged.
 */
export async function streamRemoteAttachment(
  url: string,
  filename: string,
  res: Response,
): Promise<StreamableFile> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  let stage: ClientClosedRequestStage = 'before-upstream';
  res.once('close', abort);
  res.once('finish', abort);

  try {
    if (res.destroyed || res.writableEnded) abort();
    if (controller.signal.aborted)
      throw new ClientClosedRequestException(stage);

    stage = 'awaiting-upstream';
    const upstream = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
    });
    stage = 'before-stream';
    if (res.destroyed || res.writableEnded) abort();
    if (controller.signal.aborted || !upstream.ok || !upstream.body) {
      try {
        await upstream.body?.cancel();
      } catch {
        // Keep the original cancellation or gateway failure.
      }
      if (controller.signal.aborted)
        throw new ClientClosedRequestException(stage);
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
  } catch (error) {
    // The abort signal fires only for a client close, so an abort-shaped
    // failure while it is set is a cancel; one without it is the upstream.
    if (error instanceof ClientClosedRequestException) throw error;
    if (isAbortFailure(error)) {
      if (controller.signal.aborted)
        throw new ClientClosedRequestException(stage);
      throw new BadGatewayException('The download timed out upstream');
    }
    throw error;
  } finally {
    res.off('close', abort);
    res.off('finish', abort);
  }
}
