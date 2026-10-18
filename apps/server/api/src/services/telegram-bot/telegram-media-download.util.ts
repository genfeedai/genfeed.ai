import { downloadBounded } from '@libs/security/bounded-download';
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
  let filePath = '';
  try {
    if (!botToken) throw new TelegramMediaDownloadError('failed');
    const { data, headers } = await downloadBounded(
      async ({ race, signal }) => {
        const file = await race(getFile(signal));
        signal.throwIfAborted();
        if (file.file_size !== undefined && file.file_size > MAX_DOWNLOAD_BYTES)
          throw new TelegramMediaDownloadError('too-large');
        if (!file.file_path)
          throw new TelegramMediaDownloadError('unavailable');
        filePath = file.file_path;
        return `https://api.telegram.org/file/bot${botToken}/${filePath}`;
      },
      {
        createError: (reason, response) =>
          new TelegramMediaDownloadError(reason, response?.status),
        deadlineMs: 120_000,
        destination: {
          allowedOrigins: ['https://api.telegram.org'],
          allowedSchemes: ['https:'],
        },
        maxBytes: MAX_DOWNLOAD_BYTES,
        timeoutError: new TelegramMediaDownloadError('timeout'),
      },
    );
    return { contentType: headers.get('content-type'), data, filePath };
  } catch (error: unknown) {
    if (error instanceof TelegramMediaDownloadError) throw error;
    throw new TelegramMediaDownloadError('failed');
  }
}
