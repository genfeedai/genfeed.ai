/**
 * Endpoint derivation for the browser login flow.
 *
 * The CLI stores a single `apiUrl` per profile. The PKCE flow additionally needs
 * the web app origin that serves `/oauth/cli`. Rather than force self-hosted
 * users to configure two URLs, the app origin is derived from `apiUrl` and can
 * still be overridden explicitly (`gf config set app-url`, `GENFEED_APP_URL`,
 * `gf login --app-url`).
 */

export const SAAS_API_URL = 'https://api.genfeed.ai/v1';
export const SAAS_APP_URL = 'https://app.genfeed.ai';

/** Path served by `apps/app` for the CLI/desktop authorization page. */
export const CLI_OAUTH_PATH = '/oauth/cli';

/** Local dev ports from the monorepo port table: api -> 3010, app -> 3000. */
const LOCAL_API_PORT = '3010';
const LOCAL_APP_PORT = '3000';

// `URL.hostname` keeps the brackets on IPv6 literals.
const LOCAL_HOSTNAMES = new Set(['127.0.0.1', '[::1]', 'genfeed.localhost', 'localhost']);

export interface LoginEndpoints {
  /** Base URL the CLI posts the PKCE exchange to, e.g. `https://api.example.com/v1`. */
  apiBaseUrl: string;
  /** Web app origin serving `/oauth/cli`, e.g. `https://app.example.com`. */
  appUrl: string;
  /** Fully qualified authorization page URL. */
  authUrl: string;
}

function isLocalHostname(hostname: string): boolean {
  return LOCAL_HOSTNAMES.has(hostname) || hostname.endsWith('.genfeed.localhost');
}

/** Strip trailing slashes so composed paths never become `//oauth/cli`. */
export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/**
 * Derive the web app origin from an API base URL.
 *
 * - `https://api.example.com/v1`     -> `https://app.example.com`
 * - `http://localhost:3010/v1`       -> `http://localhost:3000`
 * - `https://example.com/api/v1`     -> `https://example.com`
 *
 * Unparseable input falls back to the SaaS app so a corrupt config still
 * produces an actionable error instead of a crash.
 */
export function deriveAppUrl(apiUrl: string): string {
  let parsed: URL;

  try {
    parsed = new URL(apiUrl);
  } catch {
    return SAAS_APP_URL;
  }

  if (parsed.hostname.startsWith('api.')) {
    parsed.hostname = `app.${parsed.hostname.slice('api.'.length)}`;
    return normalizeBaseUrl(parsed.origin);
  }

  if (isLocalHostname(parsed.hostname) && parsed.port === LOCAL_API_PORT) {
    parsed.port = LOCAL_APP_PORT;
    return normalizeBaseUrl(parsed.origin);
  }

  // Single-domain deployments serve the API under a path prefix
  // (`https://example.com/api/v1`), so the origin is the app.
  return normalizeBaseUrl(parsed.origin);
}

/**
 * Resolve every URL the browser login flow needs from the active profile.
 * `appUrl` wins when explicitly configured; otherwise it is derived.
 */
export function resolveLoginEndpoints(apiUrl: string, appUrl?: string): LoginEndpoints {
  const apiBaseUrl = normalizeBaseUrl(apiUrl || SAAS_API_URL);
  const resolvedAppUrl = appUrl ? normalizeBaseUrl(appUrl) : deriveAppUrl(apiBaseUrl);

  return {
    apiBaseUrl,
    appUrl: resolvedAppUrl,
    authUrl: `${resolvedAppUrl}${CLI_OAUTH_PATH}`,
  };
}
