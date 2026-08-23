/**
 * Public media URL for an ingredient, matching how the player resolves
 * `ingredientUrl`: stable CDN / S3 first, then the legacy `metadata.result`
 * provider URL.
 *
 * Video completion writes `s3Key` (and sometimes `cdnUrl`) but never
 * `metadata.result`. Quality evaluation and Whisper were still reading only
 * `metadata.result`, so a playable generated video 404'd as "has no result URL"
 * and caption generation downloaded a reconstructed path that missed the file.
 */
export interface IngredientMediaSource {
  cdnUrl?: string | null;
  s3Key?: string | null;
  metadata?: { result?: string | null } | string | null;
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function normalizeKey(value: string): string {
  return value.replace(/^\/+/, '');
}

export function resolveIngredientMediaUrl(
  ingredient: IngredientMediaSource,
  cdnOrigin: string,
): string | undefined {
  const cdnUrl = ingredient.cdnUrl?.trim();
  if (cdnUrl && isHttpUrl(cdnUrl)) {
    return cdnUrl;
  }

  const s3Key = ingredient.s3Key?.trim();
  if (s3Key) {
    if (isHttpUrl(s3Key)) {
      return s3Key;
    }
    return `${trimSlash(cdnOrigin)}/${normalizeKey(s3Key)}`;
  }

  const metadata = ingredient.metadata;
  if (metadata && typeof metadata === 'object') {
    const result = metadata.result?.trim();
    if (result && isHttpUrl(result)) {
      return result;
    }
  }

  return undefined;
}
