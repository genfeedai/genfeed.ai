const PROFILE_PATH = /^\/([a-z0-9_]{1,15})\/?$/i;
const PROFILE_HOST = /^(?:(?:www|mobile)\.)?(?:x|twitter)\.com$/i;
const RESERVED_PATHS = new Set([
  'home',
  'search',
  'explore',
  'intent',
  'i',
  'settings',
  'messages',
  'notifications',
  'compose',
  'login',
  'signup',
  'share',
  'hashtag',
  'tos',
  'privacy',
]);

export function publicXHandle(input: string | undefined): string | undefined {
  if (!input) return undefined;
  try {
    const url = new URL(input.includes('://') ? input : `https://${input}`);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.port ||
      !PROFILE_HOST.test(url.hostname)
    )
      return undefined;
    const handle = PROFILE_PATH.exec(url.pathname)?.[1]?.toLowerCase();
    return handle && !RESERVED_PATHS.has(handle) ? handle : undefined;
  } catch {
    return undefined;
  }
}
