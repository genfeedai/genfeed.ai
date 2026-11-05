const TWEET_ID_PATTERN = /^\d{5,25}$/;
const TWEET_URL_PATTERN =
  /(?:^|\/)(?:(?:www|mobile)\.)?(?:x\.com|twitter\.com)\/(?:i|[^/?#]+)\/status(?:es)?\/(\d{5,25})(?:\/|$|\?|#)/i;
const TWEET_STATUS_PATH_PATTERN = /\/status(?:es)?\/(\d{5,25})(?:\/|$|\?|#)/i;
const LEADING_AT_SIGN_PATTERN = /^@/;

/**
 * Resolve an X/Twitter post id from a URL or raw id string.
 * Accepts x.com / twitter.com status links and bare numeric ids.
 */
export function parseTwitterPostId(
  input: string | null | undefined,
): string | null {
  if (typeof input !== 'string') {
    return null;
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  // Bare snowflake id
  if (TWEET_ID_PATTERN.test(trimmed)) {
    return trimmed;
  }

  // Strip query/hash and normalize host
  let candidate = trimmed;
  try {
    if (candidate.includes('://') || candidate.startsWith('www.')) {
      const withScheme = candidate.startsWith('www.')
        ? `https://${candidate}`
        : candidate;
      const url = new URL(withScheme);
      candidate = `${url.hostname}${url.pathname}`;
    }
  } catch {
    // Keep raw string for regex path below
  }

  const match = candidate.match(TWEET_URL_PATTERN);
  if (match?.[1]) {
    return match[1];
  }

  // Path-only: /user/status/123
  const pathMatch = candidate.match(TWEET_STATUS_PATH_PATTERN);
  if (pathMatch?.[1]) {
    return pathMatch[1];
  }

  return null;
}

export function buildTwitterStatusUrl(
  postId: string,
  username?: string | null,
): string {
  const handle =
    (username ?? 'i').replace(LEADING_AT_SIGN_PATTERN, '').trim() || 'i';
  return `https://x.com/${handle}/status/${postId}`;
}
