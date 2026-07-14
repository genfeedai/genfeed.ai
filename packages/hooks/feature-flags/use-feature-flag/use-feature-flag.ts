import { useFeatureFlagContext } from '@hooks/feature-flags/provider';

/**
 * Flags that ship ON by default. They do not require any feature-flag
 * configuration to be present, and even inside a configured flag set their
 * absence still resolves to `true`. Only an operator who explicitly sets the
 * flag to `false` turns it off.
 *
 * `conversation_shell` is default-on so the agent-first workspace shell is the
 * default experience without depending on `NEXT_PUBLIC_FEATURE_FLAG_DEFAULTS`,
 * while preserving `conversation_shell: false` as an explicit kill switch that
 * restores the legacy shell. The session circuit breaker/error fallback lives
 * downstream in `useConversationShellEnabled` and is unaffected by this flag.
 */
const DEFAULT_ON_FEATURE_FLAGS = new Set(['conversation_shell']);

export function useFeatureFlag(flagKey: string): boolean {
  const { flags, isConfigured } = useFeatureFlagContext();

  // OSS default: with no flag configuration present, every flag is on.
  if (!isConfigured) {
    return true;
  }

  // Default-on flags stay on unless explicitly disabled with `false`.
  if (DEFAULT_ON_FEATURE_FLAGS.has(flagKey)) {
    return flags[flagKey] !== false;
  }

  // Standard flags require an explicit `true`.
  return flags[flagKey] === true;
}
