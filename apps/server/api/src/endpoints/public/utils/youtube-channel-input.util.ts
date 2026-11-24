const CHANNEL_ID_PATTERN = /^UC[A-Za-z0-9_-]{22}$/;
const HANDLE_PATTERN = /^@[\p{L}\p{N}_.-]{3,30}$/u;
const CHANNEL_PATH_PATTERN = /^\/channel\/(UC[A-Za-z0-9_-]{22})(?:\/|$)/;
const HANDLE_PATH_PATTERN = /^\/(@[\p{L}\p{N}_.-]{3,30})(?:\/|$)/u;
const PROTOCOL_PATTERN = /^https?:\/\//i;
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
]);

/**
 * Reads a YouTube channel from what a visitor pastes: a channel URL, an
 * `@handle` or a channel ID. Returns the channel ID or the `@handle`, or null
 * when the text names something else (a video, a legacy /c/ or /user/ name).
 */
export function parseYoutubeChannelInput(input: string): string | null {
  const value = input.trim();
  if (CHANNEL_ID_PATTERN.test(value) || HANDLE_PATTERN.test(value)) {
    return value;
  }
  let url: URL;
  try {
    url = new URL(PROTOCOL_PATTERN.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    !YOUTUBE_HOSTS.has(url.hostname.toLowerCase())
  ) {
    return null;
  }
  const path = decodeURIComponent(url.pathname);
  return (
    CHANNEL_PATH_PATTERN.exec(path)?.[1] ??
    HANDLE_PATH_PATTERN.exec(path)?.[1] ??
    null
  );
}
