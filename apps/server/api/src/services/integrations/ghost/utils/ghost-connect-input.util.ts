import { ApiKeyConnectErrorCode } from '@genfeedai/contracts';

/**
 * Ghost Admin API keys are `{id}:{secret}`, both hex; the secret is the HMAC
 * key for the token, read as hex (`GhostService.generateToken`), so an odd
 * length or a non-hex character can never sign a token Ghost accepts.
 */
const GHOST_ADMIN_API_KEY_PATTERN = /^[0-9a-f]+:(?:[0-9a-f]{2})+$/i;
const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;
const TRAILING_SLASHES_PATTERN = /\/+$/;
/** People paste the address of Ghost Admin (`…/ghost/#/dashboard`). */
const GHOST_ADMIN_SUFFIX_PATTERN = /\/ghost$/i;

const HTTP_SCHEME_PATTERN = /^https?:\/\//i;

export type GhostConnectInput =
  | { readonly apiKey: string; readonly ghostUrl: string; readonly ok: true }
  | { readonly code: ApiKeyConnectErrorCode; readonly ok: false };

/**
 * Check the site URL and Admin API key before any request leaves, so a typo
 * gets a specific answer instead of a failed call.
 *
 * The returned `ghostUrl` is the account identity (stored as `externalId`),
 * so it keeps the scheme the user typed, or none: an account connected as
 * `myblog.com` must still match on reconnect. Only what can never be part of
 * a Ghost site address is removed: surrounding space, a hash, trailing
 * slashes and a trailing `/ghost` admin path.
 */
function stripGhostSiteExtras(rawUrl: string): string {
  const withoutHash = rawUrl.trim().split('#')[0] ?? '';
  return withoutHash
    .replace(TRAILING_SLASHES_PATTERN, '')
    .replace(GHOST_ADMIN_SUFFIX_PATTERN, '')
    .replace(TRAILING_SLASHES_PATTERN, '');
}

/**
 * One spelling per Ghost site, for matching a stored account to a new
 * connect: scheme, case and the extras `parseGhostConnectInput` strips do not
 * change which site an address names.
 */
export function toGhostSiteKey(siteUrl: string): string {
  return stripGhostSiteExtras(siteUrl)
    .replace(HTTP_SCHEME_PATTERN, '')
    .toLowerCase();
}

export function parseGhostConnectInput(
  rawUrl: string,
  rawApiKey: string,
): GhostConnectInput {
  const apiKey = rawApiKey.trim();
  if (!GHOST_ADMIN_API_KEY_PATTERN.test(apiKey)) {
    return { code: ApiKeyConnectErrorCode.INVALID_KEY_FORMAT, ok: false };
  }

  const ghostUrl = stripGhostSiteExtras(rawUrl);

  let parsed: URL;
  try {
    parsed = new URL(
      SCHEME_PATTERN.test(ghostUrl) ? ghostUrl : `https://${ghostUrl}`,
    );
  } catch {
    return { code: ApiKeyConnectErrorCode.INVALID_URL, ok: false };
  }

  if (parsed.protocol === 'http:') {
    return { code: ApiKeyConnectErrorCode.HTTPS_REQUIRED, ok: false };
  }
  if (
    parsed.protocol !== 'https:' ||
    !parsed.hostname.includes('.') ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.search !== ''
  ) {
    return { code: ApiKeyConnectErrorCode.INVALID_URL, ok: false };
  }

  return { apiKey, ghostUrl, ok: true };
}
