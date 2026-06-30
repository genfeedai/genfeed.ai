/**
 * Frontend edition detection.
 *
 * Uses NEXT_PUBLIC_ env vars since this runs in the browser.
 * Server components can also use process.env directly.
 */

const CLOUD_FLAG_VALUES = new Set(['1', 'true']);
const HOSTED_APP_HOSTNAMES = new Set(['app.genfeed.ai']);

function isTruthyCloudFlag(value: string | undefined): boolean {
  return CLOUD_FLAG_VALUES.has(value?.trim().toLowerCase() ?? '');
}

export function isOfficialHostedAppHost(hostname?: string): boolean {
  const resolvedHostname =
    hostname ??
    (typeof window === 'undefined' ? undefined : window.location.hostname);

  return HOSTED_APP_HOSTNAMES.has(resolvedHostname ?? '');
}

/** True when running as the hosted Genfeed Cloud web app. */
export function isHostedCloudApp(): boolean {
  return (
    isTruthyCloudFlag(process.env.NEXT_PUBLIC_GENFEED_CLOUD) ||
    isTruthyCloudFlag(process.env.GENFEED_CLOUD) ||
    isOfficialHostedAppHost()
  );
}

/** True when running as Genfeed Cloud (EE features enabled) */
export function isEEEnabled(): boolean {
  return !!process.env.NEXT_PUBLIC_GENFEED_LICENSE_KEY;
}

/** True when running in self-hosted core mode (no auth, no billing) */
function _isCoreMode(): boolean {
  return !isEEEnabled();
}

/** True when running the local app shell. */
export function isSelfHosted(): boolean {
  return !isHostedCloudApp();
}

/** True when the frontend targets Genfeed Cloud services. */
export function isCloudConnected(): boolean {
  return isHostedCloudApp();
}

/**
 * True when Better Auth is the active frontend session provider.
 */
export function isBetterAuthEnabled(): boolean {
  return process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED !== 'false';
}

/** True when local app with optional cloud connection configured. */
export function isHybridMode(): boolean {
  return !isHostedCloudApp() && isBetterAuthEnabled();
}

/** True when fully offline. */
export function isLocalOnly(): boolean {
  return !isHostedCloudApp() && !isBetterAuthEnabled();
}
