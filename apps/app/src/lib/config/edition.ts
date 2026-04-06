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
export function isCoreMode(): boolean {
  return !isEEEnabled();
}

/** True when running self-hosted (no Clerk auth configured) */
export function isSelfHosted(): boolean {
  return !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
}

/** True when the local app has connected to Genfeed Cloud via Clerk */
export function isCloudConnected(): boolean {
  return !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
}
