import type { PlatformFlagKey } from '@genfeedai/contracts/constants';
import { SetMetadata } from '@nestjs/common';

export const FEATURE_FLAG_KEY = 'featureFlag';

/**
 * Put a controller (or one handler) behind an Admin module/feature flag
 * (#5468). The global `FeatureFlagGuard` answers 404 while the flag is off.
 * A controller with `@OrganizationModule` needs no `@FeatureFlag` for its own
 * module's switch: `OrganizationModuleAccessService` enforces it (#8796).
 */
export function FeatureFlag(flagKey: PlatformFlagKey) {
  return SetMetadata(FEATURE_FLAG_KEY, flagKey);
}
