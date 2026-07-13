import { useFeatureFlagContext } from '@hooks/feature-flags/provider';

const FAIL_CLOSED_FEATURE_FLAGS = new Set(['conversation_shell']);

export function useFeatureFlag(flagKey: string): boolean {
  const { flags, isConfigured } = useFeatureFlagContext();

  if (!isConfigured) {
    return !FAIL_CLOSED_FEATURE_FLAGS.has(flagKey);
  }

  return flags[flagKey] === true;
}
