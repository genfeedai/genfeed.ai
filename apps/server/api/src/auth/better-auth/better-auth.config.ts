import type { IBetterAuthSocialProviderConfig } from './better-auth.types';

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

/** Parse the comma-separated trusted-origins env value into a clean list. */
export function parseTrustedOrigins(value: string | undefined): string[] {
  return parseCommaSeparated(value);
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
 * `localhost`. `local.genfeed.ai` (needs an `/etc/hosts` entry) is kept for
 * back-compat during migration; plain `localhost` also works.
 */
const LOCAL_DEV_TRUSTED_ORIGINS = [
  'https://*.genfeed.localhost',
  'http://genfeed.localhost:*',
  'http://localhost:*',
  'http://local.genfeed.ai:*',
] as const;

/**
 * Resolve Better Auth's trusted origins. Always honours whatever
 * `BETTER_AUTH_TRUSTED_ORIGINS` lists; outside production/staging it also merges
 * the standard {@link LOCAL_DEV_TRUSTED_ORIGINS} so local dev needs zero env
 * config and never hits a spurious `INVALID_ORIGIN` when accessed via canonical
 * Portless HTTPS, `genfeed.localhost`, `localhost`, or `local.genfeed.ai`.
 * Real deployments (production/staging) get exactly the configured list —
 * loopback hosts are never auto-trusted there.
 */
export function resolveTrustedOrigins(
  value: string | undefined,
  nodeEnv: string | undefined,
): string[] {
  const configured = parseTrustedOrigins(value);
  const isDeployedEnv = nodeEnv === 'production' || nodeEnv === 'staging';
  if (isDeployedEnv) {
    return configured;
  }
  return Array.from(new Set([...configured, ...LOCAL_DEV_TRUSTED_ORIGINS]));
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
