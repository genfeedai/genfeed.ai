/**
 * Enterprise Edition (EE) feature gating.
 *
 * Core features work without a license key.
 * EE features (multi-tenancy, teams, billing, etc.) require a valid key.
 */
export function isEEEnabled(): boolean {
  return !!process.env.GENFEED_LICENSE_KEY;
}

/**
 * Cloud bridge detection.
 *
 * Returns true when the local app has an active Clerk session
 * connected to Genfeed Cloud (hybrid local + cloud mode).
 */
export function isCloudConnected(): boolean {
  return !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
}
