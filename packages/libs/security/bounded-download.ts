import type { ReadableStreamDefaultReader } from 'node:stream/web';
import {
  type DestinationGuardOptions,
  safeFetch,
} from '@libs/security/destination-guard';

export interface BoundedDownloadContext {
  signal: AbortSignal;
  /** Settles with `promise`, or rejects once the shared deadline expires. */
  race: <T>(promise: Promise<T>) => Promise<T>;
}

export interface BoundedDownloadOptions {
  destination: DestinationGuardOptions;
  maxBytes: number;
  /** One budget covering URL resolution, headers and the streamed body. */
  deadlineMs: number;
  timeoutError: Error;
  /** Builds the failure for a non-OK or bodyless response, or an oversize body. */
  createError: (reason: 'failed' | 'too-large', response?: Response) => Error;
  /** Runs before the body is read; throw to reject the response. */
  inspect?: (response: Response) => void;
}

export interface BoundedDownload {
  data: Buffer;
  headers: Headers;
}

/**
 * Public http(s) only, plus private-network access for internal publisher
 * calls whose URL sits on the exact configured media origin. Never derive
 * `isPublisher` from workflow or DTO fields.
 */
export function publisherMediaDestination(
  url: string,
  configuredMediaUrl: string | undefined,
  isPublisher: boolean,
): DestinationGuardOptions {
  const options: DestinationGuardOptions = {
    allowedSchemes: ['http:', 'https:'],
  };
  if (isPublisher && configuredMediaUrl) {
    const origin = new URL(configuredMediaUrl).origin;
    if (new URL(url).origin === origin) {
      options.allowedOrigins = [origin];
      options.allowPrivateNetwork = true;
    }
  }
  return options;
}

function cancelUnusedBody(response: Response): void {
  void response.body?.cancel().catch(() => undefined);
}

/**
 * Downloads through the destination guard with one deadline and a hard byte
 * ceiling that does not trust Content-Length. Rejected, stalled and late
 * bodies are cancelled without awaiting cleanup, so a stuck cancellation can
 * neither mask the original error nor delay it.
 *
 * `url` may be a function so callers can resolve it under the same deadline.
 */
export async function downloadBounded(
  url: string | ((context: BoundedDownloadContext) => Promise<string>),
  options: BoundedDownloadOptions,
): Promise<BoundedDownload> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort(options.timeoutError);
      reject(options.timeoutError);
    }, options.deadlineMs);
  });
  // Racing consumers observe the rejection; this keeps an unraced window quiet.
  expired.catch(() => undefined);
  const context: BoundedDownloadContext = {
    race: (promise) => Promise.race([promise, expired]),
    signal: controller.signal,
  };
  let response: Response | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let isComplete = false;

  try {
    const resolvedUrl = typeof url === 'string' ? url : await url(context);
    controller.signal.throwIfAborted();
    const pending = safeFetch(
      resolvedUrl,
      { signal: controller.signal },
      options.destination,
    ).then((download) => {
      if (controller.signal.aborted) {
        cancelUnusedBody(download);
        controller.signal.throwIfAborted();
      }
      return download;
    });
    response = await context.race(pending);
    if (!response.ok || !response.body) {
      throw options.createError('failed', response);
    }
    options.inspect?.(response);
    if (Number(response.headers.get('content-length')) > options.maxBytes) {
      throw options.createError('too-large', response);
    }

    reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let bytes = 0;
    for (;;) {
      const { done, value } = await context.race(reader.read());
      if (done) {
        isComplete = true;
        return {
          data: Buffer.concat(chunks, bytes),
          headers: response.headers,
        };
      }
      bytes += value.byteLength;
      if (bytes > options.maxBytes) {
        throw options.createError('too-large', response);
      }
      chunks.push(Buffer.from(value));
    }
  } catch (error: unknown) {
    // Aborting can surface the transport's own AbortError first.
    if (
      controller.signal.aborted &&
      controller.signal.reason === options.timeoutError
    ) {
      throw options.timeoutError;
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
    controller.abort();
    if (reader) {
      if (!isComplete) void reader.cancel().catch(() => undefined);
      reader.releaseLock();
    } else if (response) {
      cancelUnusedBody(response);
    }
  }
}
