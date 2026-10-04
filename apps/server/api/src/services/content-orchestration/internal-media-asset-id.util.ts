const INTERNAL_MEDIA_PATH =
  /\/(?:images|videos|musics|audios|avatars|voices)\/([^/?#]+)(?:[/?#]|$)/i;

/**
 * Resolves a canonical internal media URL (`/images/<assetId>`, with or
 * without a host) to its asset id so the URL can go through character
 * admission like any asset-id input. Returns undefined for other URLs.
 */
export function extractInternalMediaAssetId(
  url: string | undefined,
): string | undefined {
  return url?.match(INTERNAL_MEDIA_PATH)?.[1];
}
