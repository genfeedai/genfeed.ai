import { CONVERSATION_SHELL_FLAG_KEY } from '@genfeedai/config';
import { useFeatureFlagContext } from '@hooks/feature-flags/provider';

export function useFeatureFlag(flagKey: string): boolean {
  const { flags, isConfigured } = useFeatureFlagContext();

  // The conversation shell is rollout-controlled server-side. Missing,
  // malformed, or not-yet-resolved state is always the legacy shell.
  if (flagKey === CONVERSATION_SHELL_FLAG_KEY) {
    return flags[flagKey] === true;
  }

  // OSS default: with no flag configuration present, every flag is on.
  if (!isConfigured) {
    return true;
  }

  // Standard flags require an explicit `true`.
  return flags[flagKey] === true;
}
