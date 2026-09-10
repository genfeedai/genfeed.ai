import type {
  IBetterAuthEnvValues,
  IBetterAuthRuntimeConfig,
  IBetterAuthSocialProviderConfig,
} from './better-auth.types';

/** Boot error when Better Auth is enabled but the signing secret is absent. */
export const BETTER_AUTH_SECRET_REQUIRED_MESSAGE =
  'BETTER_AUTH_SECRET is required when BETTER_AUTH_ENABLED=true';

/**
 * Pure config helpers shared by the Better Auth module (instance construction)
 * and CombinedAuthGuard (issuer-based routing). Kept free of the `better-auth`
 * import so the guard stays lightweight.
 */

/**
 * Resolve the Better Auth base URL — also the JWT `iss`. Falls back to a local
 * dev URL so the API boots without explicit config while the flag is off.
 */
export function resolveBetterAuthBaseUrl(
  betterAuthUrl: string | undefined,
  port: string | number | undefined,
): string {
  const trimmed = betterAuthUrl?.trim();
  if (trimmed) {
    return trimmed.replace(/\/+$/, '');
  }
  return `http://localhost:${port ?? 3010}`;
}

/** Split a comma-separated env value into a clean, trimmed, non-empty list. */
export function parseCommaSeparated(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * Frontends local dev serves from, auto-trusted so a fresh clone works with zero
 * `BETTER_AUTH_TRUSTED_ORIGINS` config. Port wildcards keep alternate Next.js
 * ports (for example 3131 in a worktree) on the same supported local origin
 * contract as the shared CORS configuration.
 *
 * Recommended dev hosts are the clean HTTPS `*.genfeed.localhost` Portless
 * routes: `*.localhost` resolves to loopback in every modern browser/OS
 * (RFC 6761) with NO `/etc/hosts` entry, and gives this project its own cookie
 * jar so its session/JWT never collides with another project on plain
 * `localhost`. Plain `localhost` also works.
 */
const LOCAL_DEV_TRUSTED_ORIGINS = [
  'https://*.genfeed.localhost',
  'http://genfeed.localhost:*',
  'http://localhost:*',
] as const;

/**
 * Fixed loopback origin owned by the shipped desktop client, which serves the
 * embedded web app there even when it talks to the production API. It is a
 * property of the shipped binary rather than of any one deployment, so it is
 * compiled in and trusted in every environment — no `BETTER_AUTH_TRUSTED_ORIGINS`
 * entry is required anywhere, and an operator cannot break Desktop sign-in by
 * omitting it. The port matches the desktop shell's fixed loopback port.
 * General loopback wildcards remain development-only.
 */
export const DESKTOP_SHELL_TRUSTED_ORIGINS = ['http://127.0.0.1:3230'] as const;

/**
 * Resolve Better Auth's trusted origins. Always honours whatever
 * `BETTER_AUTH_TRUSTED_ORIGINS` lists; outside production/staging it also merges
 * the standard {@link LOCAL_DEV_TRUSTED_ORIGINS} so local dev needs zero env
 * config and never hits a spurious `INVALID_ORIGIN` when accessed via canonical
 * Portless HTTPS, `genfeed.localhost`, or `localhost`.
 * Real deployments (production/staging) get the configured list plus the one
 * fixed desktop-shell loopback origin; general loopback hosts stay dev-only.
 */
export function resolveTrustedOrigins(
  value: string | undefined,
  nodeEnv: string | undefined,
): string[] {
  const configured = parseCommaSeparated(value);
  const isDeployedEnv = nodeEnv === 'production' || nodeEnv === 'staging';
  const environmentOrigins = isDeployedEnv
    ? configured
    : [...configured, ...LOCAL_DEV_TRUSTED_ORIGINS];
  return Array.from(
    new Set([...environmentOrigins, ...DESKTOP_SHELL_TRUSTED_ORIGINS]),
  );
}

/**
 * Resolve the optional cross-subdomain cookie domain (e.g. `.genfeed.ai`).
 * Returns `undefined` when unset so single-host / Community deployments keep
 * the default host-scoped session cookie.
 */
export function resolveCookieDomain(
  value: string | undefined,
): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Whether a Better Auth boolean feature flag is enabled via env. */
export function resolveBooleanFlag(
  value: string | undefined,
  fallback = false,
): boolean {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'true') {
    return true;
  }
  if (normalized === 'false') {
    return false;
  }
  return fallback;
}

/** Whether Better Auth's experimental Prisma joins are enabled via env. */
export function resolveExperimentalJoins(value: string | undefined): boolean {
  return resolveBooleanFlag(value, false);
}

/** Build a social-provider config when both credentials are present. */
export function resolveSocialProviderConfig(
  clientId: string | undefined,
  clientSecret: string | undefined,
): IBetterAuthSocialProviderConfig | undefined {
  if (clientId?.trim() && clientSecret?.trim()) {
    return { clientId: clientId.trim(), clientSecret: clientSecret.trim() };
  }
  return undefined;
}

function tryOrigin(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return undefined;
    }
    return parsed.origin;
  } catch {
    return undefined;
  }
}

/**
 * Browser login URL Better Auth must send OAuth failures to.
 *
 * Google callbacks hit the API. Better Auth's production `/error` page then
 * 302s to `/?error=…` on that API origin — the JSON health document. Always
 * send those failures to the app login page instead.
 */
export function resolveAuthErrorUrl(
  appUrl: string | undefined,
): string | undefined {
  const origin = tryOrigin(appUrl);
  return origin ? `${origin}/login` : undefined;
}

/**
 * Database OAuth state is the CSRF token. The extra signed `state` cookie
 * does not survive app.genfeed.ai → api.genfeed.ai → Google → API callback,
 * which Better Auth reports as `state_mismatch`. Skip that cookie check only
 * when the app and API are different origins; same-host self-host keeps it.
 */
export function shouldSkipOAuthStateCookieCheck(
  apiBaseUrl: string,
  appUrl: string | undefined,
): boolean {
  const apiOrigin = tryOrigin(apiBaseUrl);
  const appOrigin = tryOrigin(appUrl);
  return Boolean(apiOrigin && appOrigin && apiOrigin !== appOrigin);
}

/**
 * Resolve Better Auth boot options from ConfigService-backed env values.
 * Fails closed when the signing secret is missing so an enabled deployment
 * cannot boot into a silently broken auth path.
 */
export function resolveBetterAuthRuntimeConfig(
  env: IBetterAuthEnvValues,
): IBetterAuthRuntimeConfig {
  const secret = env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error(BETTER_AUTH_SECRET_REQUIRED_MESSAGE);
  }

  const baseURL = resolveBetterAuthBaseUrl(env.BETTER_AUTH_URL, env.PORT);
  const errorURL = resolveAuthErrorUrl(env.GENFEEDAI_APP_URL);

  return {
    apiKey: env.BETTER_AUTH_API_KEY,
    baseURL,
    cookieDomain: resolveCookieDomain(env.BETTER_AUTH_COOKIE_DOMAIN),
    errorURL,
    experimentalJoins: resolveExperimentalJoins(
      env.BETTER_AUTH_EXPERIMENTAL_JOINS,
    ),
    github: resolveSocialProviderConfig(
      env.GITHUB_CLIENT_ID,
      env.GITHUB_CLIENT_SECRET,
    ),
    google: resolveSocialProviderConfig(
      env.GOOGLE_OAUTH_CLIENT_ID,
      env.GOOGLE_OAUTH_CLIENT_SECRET,
    ),
    ipAddressHeaders: parseCommaSeparated(env.BETTER_AUTH_IP_HEADERS),
    requireEmailVerification: resolveBooleanFlag(
      env.BETTER_AUTH_REQUIRE_EMAIL_VERIFICATION,
      false,
    ),
    secret,
    skipStateCookieCheck: shouldSkipOAuthStateCookieCheck(
      baseURL,
      env.GENFEEDAI_APP_URL,
    ),
    trustedOrigins: resolveTrustedOrigins(
      env.BETTER_AUTH_TRUSTED_ORIGINS,
      env.NODE_ENV,
    ),
  };
}
