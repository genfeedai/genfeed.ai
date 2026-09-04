const YOUTUBE_HOSTS = new Set([
  'youtu.be',
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
]);
const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{6,20}$/;

export const YOUTUBE_SOURCE_UNAVAILABLE_CODE = 'youtube_source_unavailable';
export const YOUTUBE_SOURCE_UNAVAILABLE_DETAIL =
  'The YouTube video is unavailable, private, or unsupported.';
export const YOUTUBE_URL_UNSUPPORTED_DETAIL =
  'Provide a supported public YouTube video URL.';

export interface NormalizedYoutubeUrl {
  readonly normalizedUrl: string;
  readonly videoId: string;
}

export function normalizeYoutubeUrl(
  input: string,
): NormalizedYoutubeUrl | undefined {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return undefined;
  }

  const hostname = url.hostname.toLowerCase();
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    !YOUTUBE_HOSTS.has(hostname)
  ) {
    return undefined;
  }

  let videoId: string | null = null;
  if (hostname === 'youtu.be') {
    videoId = url.pathname.split('/').filter(Boolean)[0] ?? null;
  } else if (url.pathname === '/watch') {
    videoId = url.searchParams.get('v');
  } else {
    const [kind, candidate] = url.pathname.split('/').filter(Boolean);
    if (['embed', 'live', 'shorts'].includes(kind ?? '')) {
      videoId = candidate ?? null;
    }
  }

  if (!videoId || !YOUTUBE_VIDEO_ID_PATTERN.test(videoId)) {
    return undefined;
  }

  return {
    normalizedUrl: `https://www.youtube.com/watch?v=${videoId}`,
    videoId,
  };
}

export function youtubeSourceUnavailableError(): Error {
  return new Error(
    `[${YOUTUBE_SOURCE_UNAVAILABLE_CODE}] ${YOUTUBE_SOURCE_UNAVAILABLE_DETAIL}`,
  );
}

export function isYoutubeSourceUnavailableError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes(`[${YOUTUBE_SOURCE_UNAVAILABLE_CODE}]`)
  );
}
