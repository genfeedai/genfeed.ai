/**
 * Detect user-issued API credentials (`gf_live_` / `gf_test_`) presented in a
 * URL path or query string. Those locations are logged by proxies, browser
 * history, and referrer headers — credentials belong only in the
 * `Authorization` header.
 *
 * Webhook shared secrets still travel as `?token=` because several vendors
 * have no HMAC scheme and only hit the registered callback URL. That query
 * key is intentionally not treated as an API key here.
 */

const API_KEY_VALUE_PATTERN = /^gf_(live|test)_/i;

const CREDENTIAL_QUERY_KEYS = new Set(['access_token', 'api_key', 'apikey']);

export const URL_API_CREDENTIAL_REJECTION =
  'API credentials must be sent in the Authorization header';

export interface UrlCredentialRequest {
  originalUrl?: string;
  params?: Record<string, unknown>;
  path?: string;
  query?: Record<string, unknown>;
  url?: string;
}

export function isUserIssuedApiKeyMaterial(value: string): boolean {
  return API_KEY_VALUE_PATTERN.test(value.trim());
}

export function requestPresentsApiKeyInUrl(
  request: UrlCredentialRequest,
): boolean {
  if (objectContainsApiKeyMaterial(request.query, true)) {
    return true;
  }

  if (objectContainsApiKeyMaterial(request.params, false)) {
    return true;
  }

  const path = request.path ?? pathnameOf(request.originalUrl ?? request.url);
  if (pathHasApiKeySegment(path)) {
    return true;
  }

  return searchContainsApiKey(request.originalUrl ?? request.url);
}

function objectContainsApiKeyMaterial(
  record: Record<string, unknown> | undefined,
  treatNamedCredentialKeysAsSecrets: boolean,
): boolean {
  if (!record) {
    return false;
  }

  for (const [key, raw] of Object.entries(record)) {
    const values = stringValues(raw);
    if (values.length === 0) {
      continue;
    }

    if (
      treatNamedCredentialKeysAsSecrets &&
      CREDENTIAL_QUERY_KEYS.has(key.toLowerCase()) &&
      values.some((value) => value.trim().length > 0)
    ) {
      return true;
    }

    if (values.some(isUserIssuedApiKeyMaterial)) {
      return true;
    }
  }

  return false;
}

function pathHasApiKeySegment(path: string | undefined): boolean {
  if (!path) {
    return false;
  }

  return path.split('/').some(isUserIssuedApiKeyMaterial);
}

function searchContainsApiKey(urlValue: string | undefined): boolean {
  if (!urlValue?.includes('?')) {
    return false;
  }

  try {
    const parsed = new URL(urlValue, 'http://genfeed.invalid');
    return objectContainsApiKeyMaterial(
      Object.fromEntries(parsed.searchParams.entries()),
      true,
    );
  } catch {
    return false;
  }
}

function pathnameOf(urlValue: string | undefined): string | undefined {
  if (!urlValue) {
    return undefined;
  }

  const path = urlValue.split('?')[0];
  return path || undefined;
}

function stringValues(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string');
  }

  return [];
}
