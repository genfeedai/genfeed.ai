const YOUTUBE_ID_PATTERN =
  /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;

export function extractYoutubeVideoId(sourceUrl?: string): string | undefined {
  if (!sourceUrl) {
    return undefined;
  }

  const match = sourceUrl.match(YOUTUBE_ID_PATTERN);
  return match?.[1];
}

export function youtubeThumbnailUrl(sourceUrl?: string): string | undefined {
  const videoId = extractYoutubeVideoId(sourceUrl);
  if (!videoId) {
    return undefined;
  }

  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

export function clipProjectTitle(
  name: string | undefined,
  sourceVideoUrl: string | undefined,
): string {
  const trimmedName = name?.trim();
  if (trimmedName) {
    return trimmedName;
  }

  const videoId = extractYoutubeVideoId(sourceVideoUrl);
  if (videoId) {
    return `YouTube · ${videoId}`;
  }

  return sourceVideoUrl?.trim() || 'Untitled project';
}
