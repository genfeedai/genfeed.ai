import { useFeatureFlagContext } from '@hooks/feature-flags/provider';

export function useFeatureValue<T>(flagKey: string, defaultValue: T): T {
  const { flags, isConfigured } = useFeatureFlagContext();

  if (!isConfigured) {
    return defaultValue;
  }

  const value = flags[flagKey];
  return (value === undefined ? defaultValue : value) as T;
}
