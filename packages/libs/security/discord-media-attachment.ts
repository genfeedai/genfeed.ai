import { downloadBounded } from '@libs/security/bounded-download';

/** Discord rejects webhook uploads above its default 10 MiB limit. */
export const DISCORD_ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;

const DOWNLOAD_DEADLINE_MS = 30_000;

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

export interface IDiscordMediaAttachment {
  attachment: Buffer;
  name: string;
}

/**
 * Copies generated media into Discord. The delivered URLs are short-lived
 * grants, so a card that links them goes dark once they expire; an attachment
 * lives with the message and never exposes a capability. Returns null when the
 * media cannot be fetched or does not fit, so the card posts without it
 * instead of with a dead image.
 */
export async function downloadDiscordAttachment(
  url: string,
  baseName: string,
  allowedKind: 'image' | 'video',
): Promise<IDiscordMediaAttachment | null> {
  try {
    const { data, headers } = await downloadBounded(url, {
      createError: (reason) =>
        new Error(
          reason === 'failed'
            ? 'Discord media download failed'
            : 'Discord media exceeds the upload limit',
        ),
      deadlineMs: DOWNLOAD_DEADLINE_MS,
      destination: { allowedSchemes: ['https:'] },
      maxBytes: DISCORD_ATTACHMENT_MAX_BYTES,
      timeoutError: new Error('Discord media download timed out'),
    });
    const contentType = (headers.get('content-type') ?? '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    const extension = EXTENSION_BY_CONTENT_TYPE[contentType];
    if (!extension || !contentType.startsWith(`${allowedKind}/`)) return null;
    const safeName = baseName.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
    return {
      attachment: data,
      name: `${safeName || 'genfeed'}.${extension}`,
    };
  } catch {
    return null;
  }
}
