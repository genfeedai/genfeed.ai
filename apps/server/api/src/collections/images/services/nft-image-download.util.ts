import type { ReadableStreamDefaultReader } from 'node:stream/web';
import { safeFetch } from '@libs/security/destination-guard';
import { BadRequestException } from '@nestjs/common';

function cancelUnusedBody(response: Response): void {
  void response.body?.cancel().catch(() => undefined);
}

export async function downloadNftImage(
  imageUrl: string,
  maxBytes: number,
): Promise<{ contentType: string; data: Buffer }> {
  const controller = new AbortController();
  const timeoutError = new Error('NFT image download timed out');
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort(timeoutError);
      reject(timeoutError);
    }, 30_000);
  });
  let response: Response | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let complete = false;

  try {
    const pending = safeFetch(
      imageUrl,
      { signal: controller.signal },
      { allowedSchemes: ['http:', 'https:'] },
    ).then((download) => {
      if (controller.signal.aborted) {
        cancelUnusedBody(download);
        controller.signal.throwIfAborted();
      }
      return download;
    });
    response = await Promise.race([pending, expired]);
    if (!response.ok || !response.body) {
      throw new Error('NFT image could not be downloaded');
    }
    const contentType = response.headers.get('content-type') ?? 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      throw new BadRequestException('NFT is not an image');
    }
    if (Number(response.headers.get('content-length')) > maxBytes) {
      throw new BadRequestException('NFT image exceeds the upload size limit');
    }

    reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let bytes = 0;
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), expired]);
      if (done) {
        complete = true;
        return { contentType, data: Buffer.concat(chunks, bytes) };
      }
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        throw new BadRequestException(
          'NFT image exceeds the upload size limit',
        );
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    if (timeout) clearTimeout(timeout);
    controller.abort();
    if (reader) {
      if (!complete) void reader.cancel().catch(() => undefined);
      reader.releaseLock();
    } else if (response) {
      cancelUnusedBody(response);
    }
  }
}
