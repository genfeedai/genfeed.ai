/**
 * Better Auth client configuration — epic #735, Phase 2 (#737).
 *
 * Resolves the auth server base URL from `NEXT_PUBLIC_*` env vars (inlined at
 * build time in Next.js bundles). Kept
 * dependency-free so both the browser client and the server token helper can
 * import it without pulling React.
 */

const DEFAULT_API_ENDPOINT = 'https://api.genfeed.ai/v1';

interface GenfeedRuntimeConfig {
  apiEndpoint?: string;
  betterAuthEnabled?: boolean;
}

declare global {
  // Injected by the Next.js root layout so a prebuilt self-hosted image can
  // honor runtime .env changes for auth mode instead of freezing them at build.
  // eslint-disable-next-line no-var
  var __GENFEED_RUNTIME_CONFIG__: GenfeedRuntimeConfig | undefined;
}

function getRuntimeConfig(): GenfeedRuntimeConfig {
  return globalThis.__GENFEED_RUNTIME_CONFIG__ ?? {};
}

/**
 * Better Auth is mounted by the API at `${origin}/v1/auth/*` (Phase 1).
 *
 * IMPORTANT: this is the FULL path, not just `/auth`. Better Auth's `withPath()`
 * returns the base URL unchanged whenever it already carries a non-root path, so
 * passing `baseURL=${origin}/v1` + `basePath=/auth` silently drops `/auth` and
 * every request 404s. We therefore pass the bare origin as `baseURL` (see
 * {@link getApiOrigin}) and carry the whole prefix here.
 */
export const BETTER_AUTH_BASE_PATH = '/v1/auth';

/**
 * Canonical API endpoint incl. the `/v1` prefix. Mirrors
 * `EnvironmentService.apiEndpoint` (kept dep-free here to avoid pulling
 * `@genfeedai/services` into the auth foundation) including the desktop runtime
 * override.
 */
export function getApiEndpoint(): string {
  const desktopOverride = (
    globalThis as typeof globalThis & {
      __GENFEED_DESKTOP_ENV__?: { apiEndpoint?: string };
    }
  ).__GENFEED_DESKTOP_ENV__?.apiEndpoint;
  const runtimeEndpoint = getRuntimeConfig().apiEndpoint;

  return (
    desktopOverride ||
    runtimeEndpoint ||
    process.env.NEXT_PUBLIC_API_ENDPOINT ||
    DEFAULT_API_ENDPOINT
  );
}

/**
 * Bare API origin (scheme + host + port, no path) — the value Better Auth needs
 * as `baseURL` so it appends {@link BETTER_AUTH_BASE_PATH} instead of discarding
 * it. Falls back to the raw endpoint if it is somehow not a valid absolute URL.
 */
export function getApiOrigin(): string {
  const endpoint = getApiEndpoint();
  try {
    return new URL(endpoint).origin;
  } catch {
    return endpoint;
  }
}

/**
 * Better Auth is the active frontend session source. The env escape hatch is
 * intentionally negative so existing deployments stay on the self-hostable auth
 * path when the variable is absent.
 */
export function isBetterAuthEnabled(): boolean {
  const runtimeEnabled = getRuntimeConfig().betterAuthEnabled;
  if (runtimeEnabled !== undefined) {
    return runtimeEnabled;
  }

  const configuredValue =
    process.env.BETTER_AUTH_ENABLED ??
    process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED;
  return configuredValue?.trim().toLowerCase() !== 'false';
}
