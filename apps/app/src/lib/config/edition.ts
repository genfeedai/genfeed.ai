/**
 * Frontend edition detection.
 *
 * Uses NEXT_PUBLIC_ env vars since this runs in the browser.
 * Server components can also use process.env directly.
 */

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
  return !process.env.NEXT_PUBLIC_GENFEED_CLOUD;
}

/** True when the frontend targets Genfeed Cloud services. */
export function isCloudConnected(): boolean {
  return process.env.NEXT_PUBLIC_GENFEED_CLOUD === 'true';
}

/**
 * True when Better Auth is the active frontend session provider.
 */
export function isBetterAuthEnabled(): boolean {
  return process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED !== 'false';
}

/** True when local app with optional cloud connection configured. */
export function isHybridMode(): boolean {
  return !process.env.NEXT_PUBLIC_GENFEED_CLOUD && isBetterAuthEnabled();
}

/** True when fully offline. */
export function isLocalOnly(): boolean {
  return !process.env.NEXT_PUBLIC_GENFEED_CLOUD && !isBetterAuthEnabled();
}
