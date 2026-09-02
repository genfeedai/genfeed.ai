/**
 * Public CDN URL for an ingredient — the same object the player streams.
 *
 * Never returns a files-host or `/local/` disk path. Those are the files API
 * and local-disk driver, not public media. Video completion writes `s3Key`
 * (and sometimes `cdnUrl`) and does not write `metadata.result`; evaluation
 * and Whisper must still land on `cdn.genfeed.ai` / `staging-cdn.genfeed.ai`.
 */
export interface IngredientMediaSource {
  cdnUrl?: string | null;
  s3Key?: string | null;
  metadata?: { result?: string | null } | string | null;
}

const STAGING_CDN_ORIGIN = 'https://staging-cdn.genfeed.ai';

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function isFilesServiceHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  return (
    host === 'files.genfeed.ai' ||
    host === 'files.genfeed.localhost' ||
    host.endsWith('.files.genfeed.localhost')
  );
}

function publicCdnOrigin(cdnOrigin: string): string {
  const trimmed = trimSlash(cdnOrigin);
  try {
    if (isFilesServiceHostname(new URL(trimmed).hostname)) {
      return STAGING_CDN_ORIGIN;
    }
  } catch {
    return trimmed;
  }
  return trimmed;
}

function storageKeyFromPath(pathname: string): string | undefined {
  const key = pathname.replace(/^\/+/, '').replace(/^local\//, '');
  return key || undefined;
}

function toPublicCdnUrl(value: string, origin: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (isHttpUrl(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      const isLocalDiskPath = parsed.pathname.startsWith('/local/');
      if (isFilesServiceHostname(parsed.hostname) || isLocalDiskPath) {
        const key = storageKeyFromPath(parsed.pathname);
        return key ? `${origin}/${key}` : undefined;
      }
      return trimmed;
    } catch {
      return undefined;
    }
  }

  const key = storageKeyFromPath(trimmed);
  return key ? `${origin}/${key}` : undefined;
}

export function resolveIngredientMediaUrl(
  ingredient: IngredientMediaSource,
  cdnOrigin: string,
): string | undefined {
  const origin = publicCdnOrigin(cdnOrigin);

  const fromCdnColumn = ingredient.cdnUrl
    ? toPublicCdnUrl(ingredient.cdnUrl, origin)
    : undefined;
  if (fromCdnColumn) {
    return fromCdnColumn;
  }

  const fromS3Key = ingredient.s3Key
    ? toPublicCdnUrl(ingredient.s3Key, origin)
    : undefined;
  if (fromS3Key) {
    return fromS3Key;
  }

  const metadata = ingredient.metadata;
  if (metadata && typeof metadata === 'object' && metadata.result) {
    return toPublicCdnUrl(metadata.result, origin);
  }

  return undefined;
}
