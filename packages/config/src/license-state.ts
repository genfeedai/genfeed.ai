let isVerifiedEnterpriseLicense = false;

export function getLicenseVerificationVerdict(): boolean {
  return isVerifiedEnterpriseLicense;
}

/** @internal Server verification is the only production caller. */
export function setLicenseVerificationVerdict(isValid: boolean): void {
  isVerifiedEnterpriseLicense = isValid;
}
