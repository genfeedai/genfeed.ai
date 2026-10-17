import type { ReadableStreamDefaultReader } from 'node:stream/web';
import { CredentialPlatform } from '@genfeedai/contracts';
import { getPlatformMediaSpec } from '@genfeedai/contracts/constants';
import {
  type DestinationGuardOptions,
  safeFetch,
} from '@libs/security/destination-guard';

/** Internal publisher provenance; never derive it from workflow or DTO fields. */
export type LinkedInMediaSource = 'external' | 'publisher';

function cancelUnusedBody(response: Response): void {
  void response.body?.cancel().catch(() => undefined);
}

function destinationOptions(
  url: string,
  configuredMediaUrl: string | undefined,
  source: LinkedInMediaSource,
): DestinationGuardOptions {
  const options: DestinationGuardOptions = {
    allowedSchemes: ['http:', 'https:'],
  };
  if (source === 'publisher' && configuredMediaUrl) {
    const origin = new URL(configuredMediaUrl).origin;
    if (new URL(url).origin === origin) {
      options.allowedOrigins = [origin];
      options.allowPrivateNetwork = true;
    }
  }
  return options;
}

export async function downloadLinkedInMedia(
  url: string,
  kind: 'image' | 'video',
  configuredMediaUrl?: string,
  source: LinkedInMediaSource = 'external',
): Promise<Buffer> {
  const maxBytes = getPlatformMediaSpec(
    CredentialPlatform.LINKEDIN,
    kind,
  )?.maxFileSizeBytes;
  if (!maxBytes) throw new Error('LinkedIn media size limit is unavailable');
  const options = destinationOptions(url, configuredMediaUrl, source);
  const controller = new AbortController();
  const timeoutError = new Error('LinkedIn media download timed out');
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort(timeoutError);
      reject(timeoutError);
    }, 120_000);
  });
  let response: Response | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let complete = false;

  try {
    const pending = safeFetch(url, { signal: controller.signal }, options).then(
      (download) => {
        if (controller.signal.aborted) {
          cancelUnusedBody(download);
          controller.signal.throwIfAborted();
        }
        return download;
      },
    );
    response = await Promise.race([pending, expired]);
    if (!response.ok || !response.body)
      throw new Error('LinkedIn media download failed');
    if (Number(response.headers.get('content-length')) > maxBytes) {
      throw new Error('LinkedIn media exceeds its size limit');
    }
    reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let bytes = 0;
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), expired]);
      if (done) {
        complete = true;
        return Buffer.concat(chunks, bytes);
      }
      bytes += value.byteLength;
      if (bytes > maxBytes)
        throw new Error('LinkedIn media exceeds its size limit');
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
