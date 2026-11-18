import { ApiKeyConnectErrorCode } from '@genfeedai/contracts';

/** The Bluesky-hosted server every default account signs in through. */
export const BLUESKY_DEFAULT_SERVICE_URL = 'https://bsky.social';

const HTTP_SCHEME_PATTERN = /^http:\/\//i;
const HTTPS_SCHEME_PATTERN = /^https:\/\//i;

export type BlueskyServiceUrlResult =
  | { ok: true; serviceUrl: string }
  | { code: ApiKeyConnectErrorCode; ok: false };

/**
 * The origin of the account's server (its PDS). Empty means the default
 * Bluesky-hosted one; a self-hosted account passes its own https address.
 * Only the bare origin is kept, so a path or query can never reach a request.
 */
export function parseBlueskyServiceUrl(
  input: string | null | undefined,
): BlueskyServiceUrlResult {
  const trimmed = input?.trim();
  if (!trimmed) {
    return { ok: true, serviceUrl: BLUESKY_DEFAULT_SERVICE_URL };
  }
  if (HTTP_SCHEME_PATTERN.test(trimmed)) {
    return { code: ApiKeyConnectErrorCode.HTTPS_REQUIRED, ok: false };
  }

  const candidate = HTTPS_SCHEME_PATTERN.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { code: ApiKeyConnectErrorCode.INVALID_URL, ok: false };
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (parsed.pathname !== '/' && parsed.pathname !== '') ||
    parsed.port
  ) {
    return { code: ApiKeyConnectErrorCode.INVALID_URL, ok: false };
  }
  return { ok: true, serviceUrl: parsed.origin };
}
