import type { ReadableStreamDefaultReader } from 'node:stream/web';
import { safeFetch } from '@libs/security/destination-guard';
import type { Api } from 'grammy';

// Telegram's cloud Bot API uses MAX_DOWNLOAD_FILE_SIZE = 20 << 20.
const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;
const FAILURE_MESSAGES = {
  failed: 'Telegram file download failed',
  timeout: 'Telegram file download timed out',
  'too-large': 'Telegram file exceeds the 20 MB download limit',
  unavailable: 'Telegram file too large: file_path not returned by API',
} as const;

type TelegramFileMetadata = { file_path?: string; file_size?: number };
type TelegramMediaDownload = {
  data: Buffer;
  contentType: string | null;
  filePath: string;
};

/** Safe source failures must not retain tokenized URLs or raw causes. */
export class TelegramMediaDownloadError extends Error {
  constructor(
    readonly kind: keyof typeof FAILURE_MESSAGES,
    status?: number,
  ) {
    super(
      kind === 'failed' && status
        ? `${FAILURE_MESSAGES.failed}: ${status}`
        : FAILURE_MESSAGES[kind],
    );
    this.name = 'TelegramMediaDownloadError';
  }
}

function cancelUnusedBody(response: Response): void {
  void response.body?.cancel().catch(() => undefined);
}

export function toTelegramAbortSignal(
  signal: AbortSignal,
): NonNullable<Parameters<Api['getFile']>[1]> {
  // grammY accepts native signals at runtime but declares the older polyfill type.
  return signal as NonNullable<Parameters<Api['getFile']>[1]>;
}

export async function downloadTelegramMedia(
  botToken: string | undefined,
  getFile: (signal: AbortSignal) => Promise<TelegramFileMetadata>,
): Promise<TelegramMediaDownload> {
  const controller = new AbortController();
  const timeoutError = new TelegramMediaDownloadError('timeout');
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
    if (!botToken) throw new TelegramMediaDownloadError('failed');
    const file = await Promise.race([getFile(controller.signal), expired]);
    controller.signal.throwIfAborted();
    if (file.file_size !== undefined && file.file_size > MAX_DOWNLOAD_BYTES)
      throw new TelegramMediaDownloadError('too-large');
    const filePath = file.file_path;
    if (!filePath) throw new TelegramMediaDownloadError('unavailable');
    const sourceUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
    const pending = safeFetch(
      sourceUrl,
      { signal: controller.signal },
      {
        allowedSchemes: ['https:'],
        allowedOrigins: ['https://api.telegram.org'],
      },
    ).then((download) => {
      if (controller.signal.aborted) {
        cancelUnusedBody(download);
        controller.signal.throwIfAborted();
      }
      return download;
    });
    response = await Promise.race([pending, expired]);
    if (!response.ok || !response.body)
      throw new TelegramMediaDownloadError('failed', response.status);
    if (Number(response.headers.get('content-length')) > MAX_DOWNLOAD_BYTES)
      throw new TelegramMediaDownloadError('too-large');
    reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let bytes = 0;
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), expired]);
      if (done) {
        complete = true;
        return {
          data: Buffer.concat(chunks, bytes),
          contentType: response.headers.get('content-type'),
          filePath,
        };
      }
      bytes += value.byteLength;
      if (bytes > MAX_DOWNLOAD_BYTES)
        throw new TelegramMediaDownloadError('too-large');
      chunks.push(Buffer.from(value));
    }
  } catch (error: unknown) {
    if (
      controller.signal.aborted &&
      controller.signal.reason instanceof TelegramMediaDownloadError
    )
      throw controller.signal.reason;
    if (error instanceof TelegramMediaDownloadError) throw error;
    throw new TelegramMediaDownloadError('failed');
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
