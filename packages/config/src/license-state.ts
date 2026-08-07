/**
 * Internal module: not a declared `@genfeedai/config` subpath, so it is only
 * reachable from `license.ts` (read) and `license-server.ts` (verified write).
 * `scripts/architecture/check-config-package-boundary.ts` enforces both halves.
 */

let isVerifiedEnterpriseLicense = false;

export function getLicenseVerificationVerdict(): boolean {
  return isVerifiedEnterpriseLicense;
}

/** @internal Server verification is the only production caller. */
export function setLicenseVerificationVerdict(isValid: boolean): void {
  isVerifiedEnterpriseLicense = isValid;
}
