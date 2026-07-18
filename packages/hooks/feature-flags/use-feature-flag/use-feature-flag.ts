import { useFeatureFlagContext } from '@hooks/feature-flags/provider';

export function useFeatureFlag(flagKey: string): boolean {
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
