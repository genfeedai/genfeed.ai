import { useFeatureFlagContext } from '@hooks/feature-flags/provider';

export function useFeatureFlag(flagKey: string): boolean {
  const { flags, isConfigured } = useFeatureFlagContext();

  if (!isConfigured) {
    return true;
  }

  return flags[flagKey] === true;
}
