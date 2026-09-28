import type { PlatformFlagKey } from '@genfeedai/contracts/constants';
import { useFeatureFlagContext } from '@hooks/feature-flags/provider';

/** An Admin module or feature flag (#5468); unregistered keys do not compile. */
export function useFeatureFlag(flagKey: PlatformFlagKey): boolean {
  const { flags, isConfigured } = useFeatureFlagContext();

  if (Object.hasOwn(flags, flagKey)) {
    return flags[flagKey] === true;
  }

  // OSS default: with no flag configuration present, every flag is on.
  if (!isConfigured) {
    return true;
  }

  // Standard flags require an explicit `true`.
  return flags[flagKey] === true;
}
