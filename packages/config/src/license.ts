/**
 * Enterprise Edition (EE) feature gating.
 *
 * Core features work without a license key.
 * EE features (multi-tenancy, teams, billing, etc.) require a valid key.
 */
export function isEEEnabled(): boolean {
  return Boolean(
    process.env.GENFEED_LICENSE_KEY ??
      process.env.NEXT_PUBLIC_GENFEED_LICENSE_KEY,
  );
}
