import type { IBetterAuthGoogleConfig } from './better-auth.types';

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

/** Whether Better Auth's experimental Prisma joins are enabled via env. */
export function resolveExperimentalJoins(value: string | undefined): boolean {
  return value?.trim() === 'true';
}

/** Build the Google social-provider config when both credentials are present. */
export function resolveGoogleConfig(
  clientId: string | undefined,
  clientSecret: string | undefined,
): IBetterAuthGoogleConfig | undefined {
  if (clientId?.trim() && clientSecret?.trim()) {
    return { clientId: clientId.trim(), clientSecret: clientSecret.trim() };
  }
  return undefined;
}
