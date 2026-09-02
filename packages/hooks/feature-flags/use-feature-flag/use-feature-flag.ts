import { REPLY_BOT_FEATURE_FLAG } from '@genfeedai/contracts/constants';
import { useFeatureFlagContext } from '@hooks/feature-flags/provider';

export function useFeatureFlag(flagKey: string): boolean {
  const { flags, isConfigured } = useFeatureFlagContext();

  if (Object.hasOwn(flags, flagKey)) {
    return flags[flagKey] === true;
  }

  // Replies stays on unless PostHog (or an explicit override) sets false.
  // Env JSON is not the product control for this flag.
  if (flagKey === REPLY_BOT_FEATURE_FLAG) {
    return true;
  }

  // OSS default: with no flag configuration present, every flag is on.
  if (!isConfigured) {
    return true;
  }

  // Standard flags require an explicit `true`.
  return flags[flagKey] === true;
}
